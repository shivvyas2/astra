import { computeChart } from "./chart";
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

/** The one-line summary the prompt carries. */
export function describeTransits(chart: Chart): string {
  return chart.planets
    .map((p) => `${p.name} in ${p.sign}${p.retrograde ? " (retrograde)" : ""}`)
    .join(", ");
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
