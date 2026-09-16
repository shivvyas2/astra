import "server-only";
import { DateTime } from "luxon";
import type { Db } from "@/lib/supabase/route";
import type { Chart } from "@/lib/astrology/types";
import { buildTimeline, moonLongitudeFrom, type StoredEvent, type Timeline } from "./build";

export type BirthRow = {
  birth_date: string;
  birth_time: string;
  timezone: string;
  chart: { vedic: Chart } | null;
};

/** The birth details the timeline needs, or null when intake is incomplete. */
export async function loadBirthRow(db: Db): Promise<BirthRow | null> {
  const { data } = await db
    .from("birth_profiles")
    .select("birth_date, birth_time, timezone, chart")
    .maybeSingle();
  if (!data?.chart) return null;
  return data as BirthRow;
}

/** The birth moment in UT, which is what the dasha clock runs on. */
export function birthUtOf(row: BirthRow): DateTime {
  return DateTime.fromISO(`${row.birth_date}T${String(row.birth_time).slice(0, 8)}`, {
    zone: row.timezone,
  }).toUTC();
}

/**
 * Builds the user's timeline from their stored chart and pinned events.
 *
 * `today` is UTC rather than the user's local date. A dasha band is years
 * wide, so a few hours of skew cannot move an event into the wrong period —
 * unlike the daily readings, where the local date is the whole point.
 */
export async function loadTimeline(db: Db): Promise<Timeline | null> {
  const row = await loadBirthRow(db);
  if (!row) return null;

  const moon = moonLongitudeFrom(row.chart!.vedic);
  if (moon === null) return null;

  const { data: events } = await db
    .from("life_events")
    .select("id, occurred_on, precision, title, note, source")
    .order("occurred_on", { ascending: true });

  return buildTimeline({
    birthDate: String(row.birth_date),
    moonSiderealLongitude: moon,
    birthUt: birthUtOf(row),
    events: (events ?? []) as StoredEvent[],
    today: DateTime.utc().toISODate()!,
  });
}
