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
};

export type Timeline = {
  birthDate: string;
  today: string;
  periods: TimelinePeriod[];
  events: TimelineEvent[];
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
}): Timeline {
  const raw = vimshottariTimeline(args.moonSiderealLongitude, args.birthUt);

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

  const periods: TimelinePeriod[] = raw.map((p) => ({
    ...p,
    isCurrent: within(args.today, p.start, p.end),
    isPast: p.end <= args.today,
    eventCount: events.filter((e) => within(e.occurredOn, p.start, p.end)).length,
  }));

  return { birthDate: args.birthDate, today: args.today, periods, events };
}

function normalisePrecision(value: string): TimelineEvent["precision"] {
  return value === "month" || value === "year" ? value : "day";
}
