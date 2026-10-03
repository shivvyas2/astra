import { computeChart } from "./chart";
import { houseFrom, ORDINAL } from "./constants";
import { detectTransitAfflictions } from "./doshas";
import type { Chart, Tradition } from "./types";

/**
 * Today's sky, computed once per day per neighbourhood.
 *
 * Two reasons this is not computed per request. It saves running the ephemeris
 * on every message, and — more importantly — it makes the text that goes into
 * the prompt stable for the whole day, which is what lets the system prompt sit
 * behind a cache breakpoint instead of being re-billed on every turn.
 *
 * Midday UTC is the sample point: the only body that moves enough to matter
 * within a day is the Moon, and sampling the middle halves the worst-case drift.
 */
const cache = new Map<string, Promise<Chart>>();

/** Beyond this the process is holding stale days; start over rather than grow. */
const MAX_ENTRIES = 200;

export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function transitChart(args: {
  lat: number;
  lng: number;
  tradition: Tradition;
  day?: string;
}): Promise<Chart> {
  const day = args.day ?? utcDayKey();
  // One degree is ~111km; users in the same city share an entry.
  const key = `${day}|${args.tradition}|${args.lat.toFixed(0)}|${args.lng.toFixed(0)}`;

  const hit = cache.get(key);
  if (hit) return hit;

  const pending = computeChart(
    { birthDate: day, birthTime: "12:00", lat: args.lat, lng: args.lng, timezone: "UTC" },
    args.tradition,
  );
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, pending);

  try {
    return await pending;
  } catch (err) {
    cache.delete(key); // never cache a failure
    throw err;
  }
}

/** "a", "a and b", "a, b, and c" — reads sanely at any list length. */
function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Today's sky read against this person's chart.
 *
 * The old text — "Saturn in Pisces, Jupiter in Gemini" — was true of everyone
 * alive on that date and related to the reader not at all, which is most of why
 * answers about "now" came back generic. What makes a transit mean anything is
 * the house it falls in from the lagna and, in gochara proper, from the natal
 * Moon.
 *
 * Still day-stable: the transit chart is sampled once per day at midday UTC, so
 * this text can sit in the cached half of the system prompt.
 *
 * `includeAfflictions` defaults to true because the chat route has no other
 * source for them. The alerts/predictions job already surfaces
 * `detectTransitAfflictions` itself, filtered by severity, in its own prompt
 * block — passing `false` there avoids saying the same thing twice in one
 * prompt.
 */
export function describeGochara(
  natal: Chart,
  transit: Chart,
  { includeAfflictions = true }: { includeAfflictions?: boolean } = {},
): string {
  const asc = natal.ascendant.sign;
  const moonSign = natal.moonSign;
  const vedic = natal.tradition === "vedic";

  const lines = transit.planets.map((t) => {
    const touching = natal.planets
      .filter((n) => n.sign === t.sign)
      .map((n) => `natal ${n.name}`);
    const parts = [`${t.name} in ${t.sign}${t.retrograde ? " (retrograde)" : ""}`];

    // Gochara is Vedic doctrine: the house counted from the lagna, the house
    // counted from the natal Moon, and the afflictions those positions raise.
    // The house numbers are whole-sign, which is wrong for a tropical chart —
    // Western keeps Placidus (see the spec's §0) — and Sade Sati has no meaning
    // there at all. So a Western reading gets the plain sky it had before any
    // of this existed: where each body is, and which natal body it sits on.
    if (vedic) {
      parts.push(`house ${houseFrom(asc, t.sign)} from the ascendant`);
      parts.push(`${ORDINAL[houseFrom(moonSign, t.sign)]} from the Moon`);
    }

    if (touching.length > 0) parts.push(`over ${joinWithAnd(touching)}`);
    return `- ${parts.join(", ")}.`;
  });

  if (vedic && includeAfflictions) {
    const afflictions = detectTransitAfflictions(natal, transit);
    if (afflictions.length > 0) {
      lines.push(...afflictions.map((c) => `- ${c.label}: ${c.detail}`));
    }
  }
  return lines.join("\n");
}

/** Coarse enough to stay identical for hours, specific enough to frame "today". */
export function describeToday(nowLocal: {
  weekdayLongDate: string;
  hour: number;
  zone: string;
}): string {
  const part =
    nowLocal.hour < 12 ? "morning" : nowLocal.hour < 17 ? "afternoon" : nowLocal.hour < 21 ? "evening" : "night";
  return `${nowLocal.weekdayLongDate}, ${part} in ${nowLocal.zone}`;
}

/** The slow bodies whose sign changes are worth dating ahead of time. */
const INGRESS_BODIES = ["Saturn", "Jupiter", "Rahu", "Ketu", "Mars"] as const;
/** The bodies whose stations are worth dating; the nodes are always retrograde. */
const STATION_BODIES = ["Saturn", "Jupiter", "Mars"] as const;

/**
 * What changes in the sky over the coming months, dated and read against
 * this person's chart, so a prediction can say "by January" rather than
 * "soon".
 *
 * `samples` are transit charts for days ahead (the route takes 30, 90, 180,
 * and 365 days out). For each slow body, the first sample whose sign differs
 * from `today`'s is the ingress, dated to that sample's month — "by", because
 * the sample is an upper bound, not the day itself. Stations are the same
 * idea applied to the retrograde flag.
 *
 * Mirrors {@link describeGochara}: the house from the lagna and from the Moon
 * are Vedic, so a Western chart gets only the sign and any natal body it
 * lands on. Returns "" when nothing changes within the samples.
 */
export function describeUpcomingTransits(
  natal: Chart,
  today: Chart,
  samples: { day: string; chart: Chart }[],
): string {
  const vedic = natal.tradition === "vedic";
  const ordered = [...samples].sort((a, b) => a.day.localeCompare(b.day));
  const planet = (chart: Chart, name: string) => chart.planets.find((p) => p.name === name);
  const month = (day: string) => day.slice(0, 7);
  const lines: string[] = [];

  for (const name of INGRESS_BODIES) {
    const now = planet(today, name);
    if (!now) continue;
    const sample = ordered.find((s) => {
      const p = planet(s.chart, name);
      return p !== undefined && p.sign !== now.sign;
    });
    if (!sample) continue;
    const sign = planet(sample.chart, name)!.sign;

    const detail: string[] = [];
    if (vedic) {
      detail.push(`house ${houseFrom(natal.ascendant.sign, sign)} from your ascendant`);
      detail.push(`${ORDINAL[houseFrom(natal.moonSign, sign)]} from your Moon`);
    }
    const touching = natal.planets.filter((n) => n.sign === sign).map((n) => `natal ${n.name}`);
    if (touching.length > 0) detail.push(`over ${joinWithAnd(touching)}`);

    const where = detail.length > 0 ? ` (${detail.join(", ")})` : "";
    lines.push(`- ${name} moves into ${sign} by ${month(sample.day)}${where}.`);
  }

  for (const name of STATION_BODIES) {
    const now = planet(today, name);
    if (!now) continue;
    const sample = ordered.find((s) => {
      const p = planet(s.chart, name);
      return p !== undefined && p.retrograde !== now.retrograde;
    });
    if (!sample) continue;
    const direction = planet(sample.chart, name)!.retrograde ? "retrograde" : "direct";
    lines.push(`- ${name} turns ${direction} by ${month(sample.day)}.`);
  }

  return lines.join("\n");
}
