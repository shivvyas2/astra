import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { anthropic } from "@/lib/anthropic";
import { factsFor, type Derived } from "@/lib/astrology/derived";
import { computeNumerology, personalCycle, loShu, numberRelationship } from "@/lib/astrology/numerology";
import { transitChart, describeUpcomingTransits } from "@/lib/astrology/transits";
import type { Chart } from "@/lib/astrology/types";
import { isMissingRelation, trackUsage } from "@/lib/usage/record";
import { ApnsClient } from "@/lib/push/apns";
import { pushToUserDevices } from "@/lib/push/devices";
import { parseAlertCopy, type AlertCopy } from "./compose";
import { isWakingHour } from "./slots";
import { loadDeviceZones, resolveZone } from "./zones";

/**
 * Discoveries: the occasional "did you know" push.
 *
 * On about three days in seven, at some hour of the afternoon, a person gets
 * one small, true thing about themselves: a placement in their chart, a
 * number in their birth date, a sign change coming up in the sky, or a
 * prediction a past reading made whose window is open now. Not every day, and
 * never at the same time, so it reads as a thought rather than a schedule.
 *
 * Which days and which hour are decided by a hash of the user and the local
 * date, so every hourly run agrees and nothing is sent twice. Written to
 * `alerts` with severity "info" and `kinds` starting with "discovery", so it
 * lands in the bell inbox like any other alert. Composed by Haiku for a
 * fraction of a cent.
 */

export const DISCOVERY_MODEL = "claude-haiku-4-5";

export type DiscoveryTopic = "chart" | "numerology" | "sky" | "prediction";
const TOPICS: DiscoveryTopic[] = ["chart", "numerology", "sky", "prediction"];

/** How many days in seven bring a discovery, on average. */
export const DISCOVERY_DAYS_IN_SEVEN = 3;
/** Local hours a discovery may land in: after the morning reading, before the night one. */
export const DISCOVERY_HOURS = { start: 10, end: 19 } as const;
/** How far ahead to look for a sign change or station worth mentioning. */
const SKY_SAMPLE_DAYS = [7, 14, 30, 60];

/** FNV-1a, 32-bit. Stable across runs and machines, which is the point. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export type DiscoveryPlan = { hour: number; topic: DiscoveryTopic; seed: number };

/** Whether, when and about what this person hears something today. Null on a quiet day. */
export function discoveryPlan(userId: string, localDate: string): DiscoveryPlan | null {
  const h = hash32(`${userId}:${localDate}`);
  if (h % 7 >= DISCOVERY_DAYS_IN_SEVEN) return null;
  const span = DISCOVERY_HOURS.end - DISCOVERY_HOURS.start;
  const hour = DISCOVERY_HOURS.start + ((h >>> 8) % span);
  const topic = TOPICS[(h >>> 16) % TOPICS.length];
  return { hour, topic, seed: h >>> 4 };
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
const ord = (house: number) => ORDINALS[house] ?? `${house}th`;
const list = (items: (string | number)[]) =>
  items.length <= 1 ? String(items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Plain, specific sentences about the natal chart, from facts already computed. */
export function chartFacts(derived: Derived): string[] {
  const out: string[] = [];
  for (const p of derived.planets) {
    const rules = p.rules.length > 0 ? `, and it rules your ${list(p.rules.map(ord))} ${p.rules.length > 1 ? "houses" : "house"}` : "";
    if (p.dignity === "exalted") out.push(`${p.name} is exalted in ${p.sign}, in your ${ord(p.house)} house${rules}.`);
    if (p.dignity === "debilitated") out.push(`${p.name} is debilitated in ${p.sign}, in your ${ord(p.house)} house${rules}.`);
    if (p.dignity === "own" || p.dignity === "moolatrikona") {
      out.push(`${p.name} sits in its own sign, ${p.sign}, in your ${ord(p.house)} house${rules}.`);
    }
    if (p.retrograde) out.push(`${p.name} was retrograde when you were born, in ${p.sign} in your ${ord(p.house)} house.`);
    if (p.combust) out.push(`${p.name} is combust, within a few degrees of the Sun, in your ${ord(p.house)} house.`);
    if (p.conjunct.length > 0) {
      out.push(`${p.name} is conjunct ${list(p.conjunct)} in ${p.sign}, your ${ord(p.house)} house.`);
    }
  }
  for (const h of derived.houses) {
    if (![1, 2, 4, 5, 7, 9, 10, 11].includes(h.number)) continue;
    out.push(`The lord of your ${ord(h.number)} house, ${h.lord}, sits in your ${ord(h.lordHouse)} house in ${h.lordSign}.`);
  }
  for (const d of derived.dasha) {
    if (d.level !== "mahadasha") continue;
    const where = d.placement ? `; in your chart ${d.lord} sits in your ${ord(d.placement.house)} house in ${d.placement.sign}` : "";
    out.push(`You are in your ${d.lord} mahadasha until ${d.end}${where}.`);
  }
  return out;
}

/** What the birth date says, in numbers. */
export function numerologyFacts(birthDate: string, today: string): string[] {
  const out: string[] = [];
  const { mulank, bhagyank } = computeNumerology(birthDate);
  const cycle = personalCycle(birthDate, today);
  const grid = loShu(birthDate);
  out.push(`Your root number is ${mulank} and your destiny number is ${bhagyank}; the two are ${numberRelationship(mulank, bhagyank)}s in numerology.`);
  out.push(`This is a personal year ${cycle.year} for you, and this month is a personal month ${cycle.month}.`);
  if (grid.missing.length > 0) out.push(`Your birth date has no ${list(grid.missing)} in it, which numerology reads as a quality to grow into.`);
  if (grid.repeated.length > 0) out.push(`The number ${list(grid.repeated)} repeats in your birth date, which numerology reads as a strength that can tip into excess.`);
  return out;
}

export type DiscoveryFact = { topic: DiscoveryTopic; text: string };

type ProfileRow = {
  user_id: string;
  first_name: string;
  birth_date: string;
  lat: number;
  lng: number;
  timezone: string | null;
  chart: { vedic: Chart; western: Chart } | null;
};

export type DiscoverySummary = {
  considered: number;
  written: number;
  pushesSent: number;
  skipped: number;
  failures: number;
};

export async function runDiscoveries(options: { limit?: number } = {}): Promise<DiscoverySummary> {
  const admin = createAdminSupabase();
  const apns = new ApnsClient();
  const summary: DiscoverySummary = { considered: 0, written: 0, pushesSent: 0, skipped: 0, failures: 0 };

  try {
    const { data, error } = await admin
      .from("birth_profiles")
      .select("user_id, first_name, birth_date, lat, lng, timezone, chart")
      .not("chart", "is", null)
      .limit(options.limit ?? 500);
    if (error) throw new Error(error.message);
    const zones = await loadDeviceZones(admin);

    for (const profile of (data ?? []) as ProfileRow[]) {
      summary.considered += 1;
      try {
        const sent = await writeDueDiscovery(profile, admin, apns, zones);
        if (sent === null) summary.skipped += 1;
        else {
          summary.written += 1;
          summary.pushesSent += sent;
        }
      } catch (err) {
        summary.failures += 1;
        console.error("discoveries: user failed", profile.user_id, err);
      }
    }
  } finally {
    apns.close();
  }

  return summary;
}

/** Pushes sent, or null when nothing was due for this person right now. */
async function writeDueDiscovery(
  profile: ProfileRow,
  admin: SupabaseClient,
  apns: ApnsClient,
  zones: Map<string, string>,
): Promise<number | null> {
  const chart = profile.chart?.vedic;
  if (!chart) return null;

  const zone = resolveZone(zones.get(profile.user_id), profile.timezone);
  const nowLocal = DateTime.now().setZone(zone);
  const localDate = nowLocal.toISODate()!;
  const plan = discoveryPlan(profile.user_id, localDate);
  if (!plan || nowLocal.hour !== plan.hour || !isWakingHour(nowLocal.hour)) return null;

  // Once per local day, whichever run gets there first.
  const dayStart = nowLocal.startOf("day").toUTC().toISO()!;
  const { data: existing, error: existingError } = await admin
    .from("alerts")
    .select("id")
    .eq("user_id", profile.user_id)
    .contains("kinds", ["discovery"])
    .gte("created_at", dayStart)
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  if ((existing ?? []).length > 0) return null;

  const fact = await pickFact(plan, profile, chart, admin, localDate);
  if (!fact) return null;

  const copy = await composeDiscovery({
    firstName: profile.first_name,
    fact,
    today: nowLocal.toFormat("cccc, LLLL d, yyyy"),
    userId: profile.user_id,
  });

  const { data: row, error } = await admin
    .from("alerts")
    .insert({
      user_id: profile.user_id,
      severity: "info",
      kinds: ["discovery", fact.topic],
      title: copy.title,
      body: copy.body,
      detail: copy.detail,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return pushToUserDevices(admin, apns, profile.user_id, {
    title: copy.title,
    body: copy.body,
    alertId: row.id as string,
    kind: "alert",
    threadId: "sanchara-discoveries",
  });
}

/** The planned topic first, then the others, so a thin source never means silence. */
async function pickFact(
  plan: DiscoveryPlan,
  profile: ProfileRow,
  chart: Chart,
  admin: SupabaseClient,
  localDate: string,
): Promise<DiscoveryFact | null> {
  const order = [plan.topic, ...TOPICS.filter((t) => t !== plan.topic)];
  for (const topic of order) {
    const choices = await factsFor_(topic, profile, chart, admin, localDate);
    if (choices.length > 0) return { topic, text: choices[plan.seed % choices.length] };
  }
  return null;
}

async function factsFor_(
  topic: DiscoveryTopic,
  profile: ProfileRow,
  chart: Chart,
  admin: SupabaseClient,
  localDate: string,
): Promise<string[]> {
  try {
    switch (topic) {
      case "chart": {
        const derived = factsFor(chart);
        return derived ? chartFacts(derived) : [];
      }
      case "numerology":
        return numerologyFacts(profile.birth_date, localDate);
      case "sky": {
        const place = { lat: Number(profile.lat), lng: Number(profile.lng), tradition: "vedic" as const };
        const today = await transitChart(place);
        const samples = await Promise.all(
          SKY_SAMPLE_DAYS.map(async (days) => {
            const day = DateTime.utc().plus({ days }).toISODate()!;
            return { day, chart: await transitChart({ ...place, day }) };
          }),
        );
        return describeUpcomingTransits(chart, today, samples)
          .split("\n")
          .map((line) => line.replace(/^[-*•]\s*/, "").trim())
          .filter((line) => line.length > 20);
      }
      case "prediction": {
        const { data, error } = await admin
          .from("predictions")
          .select("claim, window_start, window_end, created_at")
          .eq("user_id", profile.user_id)
          .eq("status", "open")
          .lte("window_start", localDate)
          .gte("window_end", localDate)
          .limit(20);
        if (error) {
          if (!isMissingRelation(error)) console.error("discoveries: predictions read failed", error);
          return [];
        }
        return ((data ?? []) as { claim: string; window_start: string; window_end: string; created_at: string }[]).map(
          (p) =>
            `A reading on ${p.created_at.slice(0, 10)} said: "${p.claim}" for ${p.window_start} to ${p.window_end}. That window is open now; ask, gently, whether it has happened, and mention they can mark it under "What Astrya knows".`,
        );
      }
    }
  } catch (err) {
    console.error(`discoveries: ${topic} facts failed`, profile.user_id, err);
  }
  return [];
}

const TOPIC_BRIEF: Record<DiscoveryTopic, string> = {
  chart: "a placement in their birth chart",
  numerology: "a number in their birth date",
  sky: "a change coming up in the sky, read against their chart",
  prediction: "a prediction a past reading made, whose window is open now",
};

export async function composeDiscovery(args: {
  firstName: string;
  fact: DiscoveryFact;
  today: string;
  userId?: string;
}): Promise<AlertCopy> {
  const system = `You are Astrya, a warm, precise Vedic astrologer speaking with ${args.firstName}. Write one short "did you know" note about a single true thing. Plain words, second person, specific, never alarming, no jargon left unexplained. Say only what follows from the fact you are given; invent nothing.`;
  const task = `Today is ${args.today}. The one thing to share (${TOPIC_BRIEF[args.fact.topic]}):
${args.fact.text}

Reply in exactly this shape, with nothing before or after it:

TITLE: under 38 characters, the thing itself
BODY: under 140 characters, one plain sentence for a lock screen
DETAIL:
three or four short sentences in markdown: what it is, what it tends to mean, one small thing to do with it, ending with **In simple words** and one line`;

  try {
    const response = await anthropic().messages.create({
      model: DISCOVERY_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: task }],
    });
    trackUsage({ userId: args.userId, kind: "alert", model: DISCOVERY_MODEL, usage: response.usage });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = parseAlertCopy(text);
    if (parsed) return parsed;
    console.error("discovery compose: unparseable model output");
  } catch (err) {
    console.error("discovery compose error", err);
  }
  return fallbackDiscovery(args.fact);
}

/** The fact itself, plainly, when the model call fails. */
export function fallbackDiscovery(fact: DiscoveryFact): AlertCopy {
  const sentence = fact.text.split(/(?<=\.)\s/)[0] ?? fact.text;
  return {
    title: "Something in your chart",
    body: sentence.length <= 140 ? sentence : `${sentence.slice(0, 137).trimEnd()}...`,
    detail: `**Did you know**\n${fact.text}\n\n**In simple words**\nOpen Astrya to read what this means for you.`,
  };
}
