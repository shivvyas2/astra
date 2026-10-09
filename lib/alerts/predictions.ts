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
import { detectConditions, type Condition } from "@/lib/astrology/doshas";
import type { Chart } from "@/lib/astrology/types";
import { isSlotDue, type Slot } from "./slots";
import { loadDeviceZones, resolveZone } from "./zones";
import { ApnsClient } from "@/lib/push/apns";
import { pushToUserDevices } from "@/lib/push/devices";
import { parseAlertCopy, type AlertCopy } from "./compose";
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
  const summary: PredictionSummary = { considered: 0, written: 0, pushesSent: 0, skipped: 0, failures: 0 };

  try {
    const { data, error } = await admin
      .from("birth_profiles")
      .select("user_id, first_name, birth_date, lat, lng, timezone, chart")
      .not("chart", "is", null)
      .limit(options.limit ?? 500);
    if (error) throw new Error(error.message);
    const zones = await loadDeviceZones(admin);
    // Nothing goes to the model for someone who has not agreed to the current AI notice.
    const consented = await loadConsentedUserIds(admin);

    for (const profile of (data ?? []) as ProfileRow[]) {
      summary.considered += 1;
      if (!consentAllows(consented, profile.user_id)) {
        summary.skipped += 1;
        continue;
      }
      try {
        const result = await writeDueReading(profile, admin, apns, zones);
        if (result === null) summary.skipped += 1;
        else {
          summary.written += 1;
          summary.pushesSent += result;
        }
      } catch (err) {
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
    userId: profile.user_id,
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
    "It is morning where they are. Say what today holds, where their energy is best spent, one thing to watch for, and one small practical step. Look forward, not back.",
  night:
    "It is evening where they are. Reflect on the day the sky just described, then say what tomorrow morning opens with. Close on something calm — this is the last thing they read today.",
};

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

${flagged ? `Active in their chart right now:\n${flagged}\n\nWork these in only where they bear on the day. Do not alarm.\n` : ""}
Reply in exactly this shape, with nothing before or after it:

TITLE: under 38 characters, what today turns on
BODY: under 140 characters, one plain sentence for a lock screen
DETAIL:
the reading itself in markdown, following the format rules above, ending with **In simple words**`;

  try {
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
      messages: [{ role: "user", content: task }],
    });
    trackUsage({ userId: args.userId, kind: "daily", model: READING_MODEL, usage: response.usage });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = parseAlertCopy(text);
    if (parsed) return parsed;
    console.error("prediction compose: unparseable model output");
  } catch (err) {
    console.error("prediction compose error", err);
  }

  return fallbackPrediction(args.slot, args.firstName);
}

/** Never leave the slot empty: a plain prompt to open the app still beats silence. */
export function fallbackPrediction(slot: Slot, firstName: string): AlertCopy {
  return slot === "morning"
    ? {
        title: "Your reading for today",
        body: `Good morning, ${firstName}. Today's chart reading is ready in Astrya.`,
        detail: "**Today**\nYour reading is ready in the app.\n\n**In simple words**\nOpen Astrya to see what today holds.",
      }
    : {
        title: "Tonight's reading",
        body: `Good evening, ${firstName}. Tonight's reading is ready in Astrya.`,
        detail: "**Tonight**\nYour reading is ready in the app.\n\n**In simple words**\nOpen Astrya to see how today closed and what tomorrow opens with.",
      };
}
