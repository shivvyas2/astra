import { DateTime } from "luxon";
import type { DashaInfo } from "./types";

// Vimshottari order + years (total 120). Nakshatra lords repeat every 9 nakshatras.
const ORDER = [
  { lord: "Ketu", years: 7 }, { lord: "Venus", years: 20 }, { lord: "Sun", years: 6 },
  { lord: "Moon", years: 10 }, { lord: "Mars", years: 7 }, { lord: "Rahu", years: 18 },
  { lord: "Jupiter", years: 16 }, { lord: "Saturn", years: 19 }, { lord: "Mercury", years: 17 },
] as const;
const TOTAL = 120;
const NAK_SPAN = 360 / 27; // 13°20'

export function startingDashaLord(moonSiderealLongitude: number): string {
  const lon = ((moonSiderealLongitude % 360) + 360) % 360;
  return ORDER[Math.floor(lon / NAK_SPAN) % 9].lord;
}

const addYears = (dt: DateTime, y: number) => dt.plus({ days: y * 365.25 }); // Vedic 365.25-day year

/**
 * One mahadasha as the engine works with it internally.
 *
 * `virtualStart` is where the period *would* have begun had the native been
 * born at its start. For every period after the first that is simply `start`;
 * for the birth period it sits before birth, because a native is born partway
 * through a mahadasha. Antardashas are laid out from `virtualStart`, which is
 * what keeps them aligned to the real period rather than to the birth moment.
 */
type Span = {
  lord: string;
  start: DateTime;
  end: DateTime;
  virtualStart: DateTime;
  fullYears: number;
};

/** The twelve mahadashas running forward from birth. */
function mahadashaSpans(moonSiderealLongitude: number, birthUt: DateTime): Span[] {
  const lon = ((moonSiderealLongitude % 360) + 360) % 360;
  const nakIndex = Math.floor(lon / NAK_SPAN);
  const startLordIndex = nakIndex % 9;
  const fractionElapsed = (lon - nakIndex * NAK_SPAN) / NAK_SPAN;

  const first = ORDER[startLordIndex];
  const spans: Span[] = [
    {
      lord: first.lord,
      start: birthUt,
      // The first period is the *balance* of the one already running at birth.
      end: addYears(birthUt, first.years * (1 - fractionElapsed)),
      virtualStart: addYears(birthUt, -(first.years * fractionElapsed)),
      fullYears: first.years,
    },
  ];
  for (let i = 1; i < 12; i++) {
    const o = ORDER[(startLordIndex + i) % 9];
    const start = spans[i - 1].end;
    spans.push({
      lord: o.lord,
      start,
      end: addYears(start, o.years),
      virtualStart: start,
      fullYears: o.years,
    });
  }
  return spans;
}

/**
 * The nine antardashas inside a mahadasha, in Vimshottari order from its own
 * lord. Each runs for its share of the parent: `mahaYears × subYears / 120`.
 *
 * Sub-periods that finished before birth are dropped, and one straddling birth
 * is clipped to it — a chart has nothing to say about time the native wasn't
 * alive for.
 */
function antardashaSpans(span: Span): { lord: string; start: DateTime; end: DateTime }[] {
  const lordIndex = ORDER.findIndex((o) => o.lord === span.lord);
  const out: { lord: string; start: DateTime; end: DateTime }[] = [];
  let cursor = span.virtualStart;
  for (let i = 0; i < 9; i++) {
    const sub = ORDER[(lordIndex + i) % 9];
    const start = cursor;
    const end = addYears(start, (span.fullYears * sub.years) / TOTAL);
    cursor = end;
    if (end <= span.start) continue; // wholly elapsed before birth
    out.push({ lord: sub.lord, start: start < span.start ? span.start : start, end });
  }
  return out;
}

const iso = (dt: DateTime) => dt.toISODate()!;

/** A dasha period as it crosses the API boundary. */
export type DashaPeriod = {
  lord: string;
  start: string; // ISO date
  end: string;
  antardashas: { lord: string; start: string; end: string }[];
};

/**
 * The native's whole life as Vimshottari divides it: twelve mahadashas from
 * birth, each with its antardashas nested.
 *
 * This is the same computation `computeVimshottari` runs — that function
 * answers "where am I now", this one hands back the entire map.
 */
export function vimshottariTimeline(
  moonSiderealLongitude: number,
  birthUt: DateTime,
): DashaPeriod[] {
  return mahadashaSpans(moonSiderealLongitude, birthUt).map((span) => ({
    lord: span.lord,
    start: iso(span.start),
    end: iso(span.end),
    antardashas: antardashaSpans(span).map((a) => ({
      lord: a.lord,
      start: iso(a.start),
      end: iso(a.end),
    })),
  }));
}

// `now` is injectable so tests are deterministic.
export function computeVimshottari(
  moonSiderealLongitude: number,
  birthUt: DateTime,
  now: DateTime = DateTime.utc(),
): DashaInfo {
  const spans = mahadashaSpans(moonSiderealLongitude, birthUt);
  const maha = spans.find((s) => now >= s.start && now < s.end) ?? spans[0];
  const subs = antardashaSpans(maha);
  const antar = subs.find((a) => now >= a.start && now < a.end) ?? subs[0];

  return {
    mahadasha: maha.lord,
    mahadashaStart: iso(maha.start),
    mahadashaEnd: iso(maha.end),
    antardasha: antar.lord,
    antardashaStart: iso(antar.start),
    antardashaEnd: iso(antar.end),
  };
}
