import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { anthropic, READING_MODEL, supportsAdaptiveThinking, LOW_EFFORT } from "@/lib/anthropic";
import { buildChartSystem, buildTodaySystem, ageOn } from "@/lib/astrology/prompt";
import { computeNumerology } from "@/lib/astrology/numerology";
import { transitChart, describeGochara } from "@/lib/astrology/transits";
import { factsFor } from "@/lib/astrology/derived";
import { houseFrom } from "@/lib/astrology/constants";
import { detectConditions, type Condition } from "@/lib/astrology/doshas";
import type { Chart } from "@/lib/astrology/types";
import { isSlotDue, type Slot } from "./slots";
import { loadDeviceZones, resolveZone } from "./zones";
import { languageRule, loadReadingLanguages, type ReadingLanguage } from "@/lib/astrology/language";
import { ApnsClient } from "@/lib/push/apns";
import { pushToUserDevices } from "@/lib/push/devices";
import type { AlertCopy } from "./compose";
import { isListening, loadActivity } from "./audience";
import { loadPushContext, type PushContext } from "./context";
import { PUSH_VOICE, TENDER_VOICE } from "./voice";
import { writeCopy } from "./write";
import { AiUnavailable, GIVE_UP_AFTER } from "./unavailable";
import { trackUsage } from "@/lib/usage/record";
import { consentAllows, loadConsentedUserIds } from "@/lib/billing/consent";

type ProfileRow = {
  user_id: string;
  first_name: string;
  birth_date: string;
  lat: number;
  lng: number;
  timezone: string | null;
  chart: { vedic: Chart; western: Chart } | null;
};

export type PredictionSummary = {
  considered: number;
  written: number;
  pushesSent: number;
  skipped: number;
  failures: number;
  /** Readings the AI could not write; left for the next run. */
  aiFailures: number;
  /** Why the last one failed, safe to log. */
  aiReason?: string;
};

/**
 * The twice-daily reading.
 *
 * Runs every hour, but each user is handled on their own clock (the phone's
 * zone, else the birthplace's): the slot comes from their local hour and the
 * delivery windows in slots.ts, the date stored is their local date, and a
 * unique index means a repeat run writes nothing. Readings are kept whether
 * or not a push goes out, so the app can show the history by date.
 */
export async function runDuePredictions(options: { limit?: number } = {}): Promise<PredictionSummary> {
  const admin = createAdminSupabase();
  const apns = new ApnsClient();
  const summary: PredictionSummary = { considered: 0, written: 0, pushesSent: 0, skipped: 0, failures: 0, aiFailures: 0 };

  try {
    const { data, error } = await admin
      .from("birth_profiles")
      .select("user_id, first_name, birth_date, lat, lng, timezone, chart")
      .not("chart", "is", null)
      .limit(options.limit ?? 500);
    if (error) throw new Error(error.message);
    const zones = await loadDeviceZones(admin);
    const languages = await loadReadingLanguages(admin);
    // Nothing goes to the model for someone who has not agreed to the current AI notice.
    const consented = await loadConsentedUserIds(admin);
    // A week without opening Astrya and it stops, until they come back.
    const activity = await loadActivity(admin);

    for (const profile of (data ?? []) as ProfileRow[]) {
      summary.considered += 1;
      if (!consentAllows(consented, profile.user_id) || !isListening(activity, profile.user_id)) {
        summary.skipped += 1;
        continue;
      }
      try {
        const result = await writeDueReading(profile, admin, apns, zones, languages);
        if (result === null) summary.skipped += 1;
        else {
          summary.written += 1;
          summary.pushesSent += result;
        }
      } catch (err) {
        if (err instanceof AiUnavailable) {
          summary.aiFailures += 1;
          summary.aiReason = err.reason;
          // Not one person's problem: stop paying for calls that will fail.
          if (summary.aiFailures >= GIVE_UP_AFTER && summary.written === 0) break;
          continue;
        }
        summary.failures += 1;
        console.error("predictions: user failed", profile.user_id, err);
      }
    }
  } finally {
    apns.close();
  }

  return summary;
}

/** Returns the number of pushes sent, or null when nothing was due. */
async function writeDueReading(
  profile: ProfileRow,
  admin: SupabaseClient,
  apns: ApnsClient,
  zones: Map<string, string>,
  languages: Map<string, ReadingLanguage> = new Map(),
): Promise<number | null> {
  const chart = profile.chart?.vedic;
  if (!chart) return null;

  const zone = resolveZone(zones.get(profile.user_id), profile.timezone);
  const nowLocal = DateTime.now().setZone(zone);
  const forDate = nowLocal.toFormat("yyyy-LL-dd");

  const { data: existing, error: existingError } = await admin
    .from("daily_readings")
    .select("slot")
    .eq("user_id", profile.user_id)
    .eq("for_date", forDate);
  if (existingError) throw new Error(existingError.message);

  const slot = isSlotDue(nowLocal.hour, ((existing ?? []) as { slot: Slot }[]).map((row) => row.slot));
  if (!slot) return null;

  const transits = await transitChart({ lat: Number(profile.lat), lng: Number(profile.lng), tradition: "vedic" });
  // The same afflictions the alert job tracks, so the reading and the alerts
  // never contradict each other.
  const conditions = detectConditions(chart, transits);

  const copy = await composePrediction({
    language: languages.get(profile.user_id),
    firstName: profile.first_name,
    chart,
    numerology: computeNumerology(profile.birth_date),
    // This job already surfaces detectTransitAfflictions itself, filtered by
    // severity, in the "Active in their chart right now" block below — asking
    // for them here too would say the same thing twice in one prompt.
    transits: describeGochara(chart, transits, { includeAfflictions: false }),
    today: nowLocal.toFormat("cccc, LLLL d, yyyy"),
    age: ageOn(profile.birth_date, nowLocal),
    slot,
    conditions,
    area: areaToday(chart, transits),
    userId: profile.user_id,
    context: await loadPushContext(admin, { userId: profile.user_id, chart, today: forDate }),
  });

  const { data: row, error } = await admin
    .from("daily_readings")
    .insert({
      user_id: profile.user_id,
      for_date: forDate,
      slot,
      tradition: "vedic",
      title: copy.title,
      body: copy.body,
      detail: copy.detail,
    })
    .select("id")
    .single();

  if (error) {
    // The unique index is the safety net for two runs racing; treat a conflict
    // as "already done" rather than an error.
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }

  return pushToUserDevices(admin, apns, profile.user_id, {
    title: copy.title,
    body: copy.body,
    alertId: row.id as string,
    kind: "daily",
    threadId: `sanchara-daily-${slot}`,
  });
}

const SLOT_BRIEF: Record<Slot, string> = {
  morning:
    "It is morning where they are. Find the one moment, choice or person today turns on. Say what to do about it, and what they will be tempted to do instead. Look forward, not back.",
  night:
    "It is evening where they are. Name the one thing today was really about, then give them one definite thing to walk into tomorrow with. Leave them curious about tomorrow, not wound up.",
};

/** What each house is about, in words for a hook. */
const AREA = [
  "", "how they come across, their body language, starting something", "money in hand, what they say out loud, food, family talk",
  "messages, courage, siblings, small trips, doing it anyway", "home, mother, comfort, what they come back to", "flirting, children, fun, making things, being noticed",
  "work pile, routines, rivals, favours owed", "the other person: partner, deal, argument, agreement", "secrets, shared money, the thing not said, letting go",
  "luck, father or mentor, beliefs, far away", "boss, reputation, being seen at work", "friends, gains, plans, the group chat", "sleep, spending, solitude, the past, what they avoid",
];

/** The Moon's house today: the one thing in the sky that is different every couple of days. */
export function areaToday(chart: Chart, sky: Chart): string | null {
  const moon = sky.planets.find((p) => p.name === "Moon");
  const from = chart.timeKnown === false ? (chart.moonDay?.changesSign ? null : chart.moonSign) : chart.ascendant.sign;
  const house = moon && from ? houseFrom(from, moon.sign) : 0;
  if (!house) return null;
  return `TODAY'S OWN AREA: ${AREA[house]}. (The Moon is in ${moon!.sign}, house ${house}${chart.timeKnown === false ? " from their Moon" : ""}.) Lead from here unless their history below has more pull. The slow planets sit where they sat last week: use them as the reason, not as the subject again.`;
}

export async function composePrediction(args: {
  firstName: string;
  chart: Chart;
  numerology: { mulank: number; bhagyank: number };
  transits: string;
  today: string;
  /** Whole years lived today; omitted when the birth date does not parse. */
  age?: number;
  slot: Slot;
  conditions: Condition[];
  /** For the usage ledger (model_usage). */
  userId?: string;
  language?: ReadingLanguage;
  /** From {@link areaToday}. */
  area?: string | null;
  /** Their history and what they were last told (lib/alerts/context.ts). */
  context?: PushContext;
}): Promise<AlertCopy> {
  const flagged = args.conditions
    .filter((c) => c.severity !== "info" && c.scope !== "natal")
    .slice(0, 4)
    .map((c) => `- ${c.label}: ${c.detail}`)
    .join("\n");

  const stable = buildChartSystem({
    firstName: args.firstName,
    tradition: "vedic",
    chart: args.chart,
    derived: factsFor(args.chart),
    numerology: args.numerology,
  });
  const todayBlock = buildTodaySystem({ today: args.today, age: args.age, transits: args.transits, maxWords: 150 });

  const task = `${SLOT_BRIEF[args.slot]}

${args.context?.tender ? TENDER_VOICE : PUSH_VOICE}
${args.area ? `\n${args.area}\n` : ""}${args.context?.block ? `\n${args.context.block}\n` : ""}
${flagged ? `Active in their chart right now:\n${flagged}\n\nWork these in only where they bear on the day. Do not alarm.\n` : ""}
Reply in exactly this shape, with nothing before or after it:

TITLE: under 38 characters, the hook
BODY: under 110 characters, for a lock screen
DETAIL:
the reading itself in markdown, following the format rules above, its first lines answering the hook with the placement behind it, ending with **In simple words**${languageRule(args.language ?? "english", { structured: true })}`;

  return writeCopy({
    label: "prediction",
    task,
    check: { recent: args.context?.recent, tender: args.context?.tender, secret: args.context?.secret },
    call: async (messages) => {
    const response = await anthropic().messages.create({
      model: READING_MODEL,
      max_tokens: 1600,
      ...(supportsAdaptiveThinking(READING_MODEL)
        ? { thinking: { type: "adaptive" } as unknown as Anthropic.ThinkingConfigParam }
        : {}),
      ...LOW_EFFORT,
      system: [
        // Identical for this user on every run, so it is a cache read whenever
        // two of their readings land within the hour.
        { type: "text", text: stable, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: todayBlock },
      ],
      messages,
    });
    trackUsage({ userId: args.userId, kind: "daily", model: READING_MODEL, usage: response.usage });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    },
  });
}
