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

  const lines = transit.planets.map((t) => {
    const fromAsc = houseFrom(asc, t.sign);
    const fromMoon = houseFrom(moonSign, t.sign);
    const touching = natal.planets
      .filter((n) => n.sign === t.sign)
      .map((n) => `natal ${n.name}`);
    const parts = [
      `${t.name} in ${t.sign}${t.retrograde ? " (retrograde)" : ""}`,
      `house ${fromAsc} from the ascendant`,
      `${ORDINAL[fromMoon]} from the Moon`,
    ];
    if (touching.length > 0) parts.push(`over ${joinWithAnd(touching)}`);
    return `- ${parts.join(", ")}.`;
  });

  if (includeAfflictions) {
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
