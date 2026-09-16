import "server-only";
import { DateTime } from "luxon";
import type { Db } from "@/lib/supabase/route";
import type { Chart } from "@/lib/astrology/types";
import { buildTimeline, moonLongitudeFrom, type StoredEvent, type StoredReading, type Timeline } from "./build";

export type BirthRow = {
  first_name: string;
  birth_date: string;
  birth_time: string;
  timezone: string;
  chart: { vedic: Chart } | null;
};

/** The birth details the timeline needs, or null when intake is incomplete. */
export async function loadBirthRow(db: Db): Promise<BirthRow | null> {
  const { data } = await db
    .from("birth_profiles")
    .select("first_name, birth_date, birth_time, timezone, chart")
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
 * Builds the user's timeline from their stored chart, pinned events, and the
 * explanations already written for them.
 *
 * `today` is UTC rather than the user's local date. A dasha band is years
 * wide, so a few hours of skew cannot move an event into the wrong period —
 * unlike the daily readings, where the local date is the whole point.
 */
export async function loadTimeline(db: Db, row?: BirthRow | null): Promise<Timeline | null> {
  const birth = row === undefined ? await loadBirthRow(db) : row;
  if (!birth) return null;

  const moon = moonLongitudeFrom(birth.chart!.vedic);
  if (moon === null) return null;

  const [{ data: events }, { data: readings }] = await Promise.all([
    db
      .from("life_events")
      .select("id, occurred_on, precision, title, note, source")
      .order("occurred_on", { ascending: true }),
    db.from("period_readings").select("lord, period_start, theme, meaning, events_hash"),
  ]);

  return buildTimeline({
    birthDate: String(birth.birth_date),
    moonSiderealLongitude: moon,
    birthUt: birthUtOf(birth),
    events: (events ?? []) as StoredEvent[],
    readings: (readings ?? []) as StoredReading[],
    today: DateTime.utc().toISODate()!,
  });
}

/** What the scan record says, for deciding whether to offer another one. */
export type ScanState = { scanned: boolean; messagesSinceScan: number };

/**
 * How much the user has said since we last mined their history.
 *
 * Counts only their own turns: the offer to look again is worth making when
 * they have told us more, not when we have told them more.
 */
export async function loadScanState(db: Db): Promise<ScanState> {
  const { data: scan } = await db.from("life_event_scans").select("scanned_at").maybeSingle();
  if (!scan) return { scanned: false, messagesSinceScan: 0 };

  const { data: conversations } = await db.from("conversations").select("id");
  const ids = (conversations ?? []).map((c) => c.id as string);
  if (ids.length === 0) return { scanned: true, messagesSinceScan: 0 };

  const { count } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", ids)
    .eq("role", "user")
    .gt("created_at", String(scan.scanned_at));
  return { scanned: true, messagesSinceScan: count ?? 0 };
}
