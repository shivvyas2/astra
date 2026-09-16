import { DateTime } from "luxon";
import { SIGNS } from "@/lib/astrology/constants";
import { vimshottariTimeline, type DashaPeriod } from "@/lib/astrology/dasha";
import type { Chart } from "@/lib/astrology/types";

/** A life event, placed in the dasha period it fell in. */
export type TimelineEvent = {
  id: string;
  occurredOn: string;
  precision: "day" | "month" | "year";
  title: string;
  note: string | null;
  source: "manual" | "extracted";
  /** The periods running when it happened — the whole point of the feature. */
  mahadasha: string | null;
  antardasha: string | null;
};

export type TimelinePeriod = DashaPeriod & {
  isCurrent: boolean;
  isPast: boolean;
  /** Events pinned inside this period, so a band can show weight at a glance. */
  eventCount: number;
  /** Plain-language reading of the period, once written. */
  theme: string | null;
  meaning: string | null;
  /** No reading yet, or the moments inside changed since it was written. */
  stale: boolean;
};

/** Where the user is right now: the current mahadasha–antardasha pair. */
export type TimelineNow = {
  lord: string;
  antardasha: string;
  /** The antardasha's span; the mahadasha's is on the current period. */
  start: string;
  end: string;
  theme: string | null;
  meaning: string | null;
};

export type Timeline = {
  birthDate: string;
  today: string;
  periods: TimelinePeriod[];
  events: TimelineEvent[];
  now: TimelineNow | null;
  /** Any period, or the now summary, needs (re)writing. */
  needsExplaining: boolean;
};

/** A stored explanation, as it comes out of `period_readings`. */
export type StoredReading = {
  lord: string;
  period_start: string;
  theme: string;
  meaning: string;
  events_hash: string;
};

/** Stored life event, as it comes out of the database. */
export type StoredEvent = {
  id: string;
  occurred_on: string;
  precision: string;
  title: string;
  note: string | null;
  source: string;
};

/**
 * Recovers the Moon's sidereal longitude from a stored chart.
 *
 * Planets are persisted as sign plus degree-within-sign rather than absolute
 * longitude, so it is reassembled here. This is what lets the timeline load
 * without re-running the Swiss Ephemeris, which costs a WASM init per process.
 *
 * Returns null for a chart with no Moon or an unrecognised sign — a caller
 * must fall back to recomputing rather than draw a wrong life.
 */
export function moonLongitudeFrom(chart: Chart): number | null {
  const moon = chart.planets.find((p) => p.name === "Moon");
  if (!moon) return null;
  const signIndex = SIGNS.indexOf(moon.sign as (typeof SIGNS)[number]);
  if (signIndex < 0) return null;
  if (!Number.isFinite(moon.degree)) return null;
  return signIndex * 30 + moon.degree;
}

const within = (date: string, start: string, end: string) => date >= start && date < end;

/**
 * Assembles the life map: every Vimshottari period from birth, with the user's
 * own events placed inside them.
 *
 * Both halves are joined on the server so the client renders rather than
 * reasons — the iOS view should never have to know how a dasha is bounded.
 */
export function buildTimeline(args: {
  birthDate: string;
  moonSiderealLongitude: number;
  birthUt: DateTime;
  events: StoredEvent[];
  today: string;
  readings?: StoredReading[];
}): Timeline {
  const raw = vimshottariTimeline(args.moonSiderealLongitude, args.birthUt);
  const readings = args.readings ?? [];
  const readingFor = (lord: string, start: string) =>
    readings.find((r) => r.lord === lord && r.period_start === start);

  const events: TimelineEvent[] = args.events
    .map((e) => {
      const maha = raw.find((p) => within(e.occurred_on, p.start, p.end));
      const antar = maha?.antardashas.find((a) => within(e.occurred_on, a.start, a.end));
      return {
        id: e.id,
        occurredOn: e.occurred_on,
        precision: normalisePrecision(e.precision),
        title: e.title,
        note: e.note,
        source: e.source === "extracted" ? ("extracted" as const) : ("manual" as const),
        // Null rather than a guess when an event sits outside the computed
        // span — a 121-year-old is not a case worth inventing a period for.
        mahadasha: maha?.lord ?? null,
        antardasha: antar?.lord ?? null,
      };
    })
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));

  const periods: TimelinePeriod[] = raw.map((p) => {
    const row = readingFor(p.lord, p.start);
    const fresh = !!row && row.events_hash === eventsHashFor(p, events);
    return {
      ...p,
      isCurrent: within(args.today, p.start, p.end),
      isPast: p.end <= args.today,
      eventCount: events.filter((e) => within(e.occurredOn, p.start, p.end)).length,
      theme: row?.theme ?? null,
      meaning: row?.meaning ?? null,
      stale: !fresh,
    };
  });

  const current = periods.find((p) => p.isCurrent);
  const antar = current?.antardashas.find((a) => within(args.today, a.start, a.end));
  let now: TimelineNow | null = null;
  if (current && antar) {
    // The now row is keyed on the antardasha start, so it expires by itself
    // when the sub-period turns over.
    const row = readingFor(NOW_LORD, antar.start);
    now = {
      lord: current.lord,
      antardasha: antar.lord,
      start: antar.start,
      end: antar.end,
      theme: row?.theme ?? null,
      meaning: row?.meaning ?? null,
    };
  }

  const needsExplaining = periods.some((p) => p.stale) || (now !== null && now.meaning === null);

  return { birthDate: args.birthDate, today: args.today, periods, events, now, needsExplaining };
}

/** The literal lord used for the "where you are now" row in `period_readings`. */
export const NOW_LORD = "now";

/**
 * Which pinned moments a period's explanation was written against.
 *
 * Sorted before hashing so the order events come back from the database can
 * never make a fresh explanation look stale. An empty period hashes to "0" so
 * the common case reads clearly in the table.
 */
export function eventsHashFor(period: { start: string; end: string }, events: TimelineEvent[]): string {
  const keys = events
    .filter((e) => within(e.occurredOn, period.start, period.end))
    .map((e) => `${e.occurredOn}:${e.title.toLowerCase()}`)
    .sort();
  if (keys.length === 0) return "0";
  // A small non-cryptographic hash is enough: this detects change, it does
  // not protect anything. Keeping it pure also keeps this module free of
  // Node-only imports, which is what lets it stay unit-testable and shared.
  let h = 2166136261;
  const text = keys.join("\n");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function normalisePrecision(value: string): TimelineEvent["precision"] {
  return value === "month" || value === "year" ? value : "day";
}
