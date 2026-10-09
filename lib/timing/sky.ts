import { DateTime } from "luxon";
import { computeChart } from "@/lib/astrology/chart";
import type { Chart } from "@/lib/astrology/types";

/**
 * The sky's own calendar: the exact day each slow body changes sign or turns
 * retrograde or direct, over the months ahead.
 *
 * Sidereal positions do not depend on where you stand, so this is computed
 * once per day per process and shared by everyone; reading it against one
 * person's chart is lib/timing/engine.ts. The scan steps two days at a time
 * and settles each change to the day with one extra chart, about 190 charts
 * (a few hundred milliseconds) for a year.
 */
export const TIMING_BODIES = ["Saturn", "Jupiter", "Rahu", "Ketu", "Mars"] as const;
export type TimingBody = (typeof TIMING_BODIES)[number];
/** The nodes are always retrograde, so only these have stations. */
const STATION_BODIES: TimingBody[] = ["Saturn", "Jupiter", "Mars"];

export type SkyEvent =
  | { kind: "ingress"; date: string; body: TimingBody; sign: string; from: string; retrograde: boolean }
  | { kind: "station"; date: string; body: TimingBody; sign: string; retrograde: boolean };

type Positions = Map<TimingBody, { sign: string; retrograde: boolean }>;

const STEP_DAYS = 2;

async function positionsOn(day: string, compute: (day: string) => Promise<Chart>): Promise<Positions> {
  const chart = await compute(day);
  const out: Positions = new Map();
  for (const body of TIMING_BODIES) {
    const p = chart.planets.find((x) => x.name === body);
    if (p) out.set(body, { sign: p.sign, retrograde: p.retrograde });
  }
  return out;
}

const noonChart = (day: string) =>
  computeChart({ birthDate: day, birthTime: "12:00", lat: 0, lng: 0, timezone: "UTC" }, "vedic");

/**
 * Every ingress and station from `from` (exclusive) to `months` ahead.
 * `compute` is injectable for tests; it defaults to a noon-UTC sidereal chart.
 */
export async function scanSky(
  from: string,
  months: number,
  compute: (day: string) => Promise<Chart> = noonChart,
): Promise<SkyEvent[]> {
  const start = DateTime.fromISO(from, { zone: "utc" });
  const end = start.plus({ months });
  const events: SkyEvent[] = [];

  let prevDay = start;
  let prev = await positionsOn(prevDay.toISODate()!, compute);
  while (prevDay < end) {
    const day = prevDay.plus({ days: STEP_DAYS });
    const now = await positionsOn(day.toISODate()!, compute);
    // Something changed in the step: look at the day between to place it.
    const changed = TIMING_BODIES.some((b) => {
      const a = prev.get(b), c = now.get(b);
      return a && c && (a.sign !== c.sign || a.retrograde !== c.retrograde);
    });
    if (changed) {
      const mid = prevDay.plus({ days: 1 });
      const middle = await positionsOn(mid.toISODate()!, compute);
      for (const body of TIMING_BODIES) {
        const a = prev.get(body), c = now.get(body), m = middle.get(body);
        if (!a || !c || !m) continue;
        if (a.sign !== c.sign) {
          const date = a.sign !== m.sign ? mid : day;
          events.push({ kind: "ingress", date: date.toISODate()!, body, sign: c.sign, from: a.sign, retrograde: c.retrograde });
        }
        if (a.retrograde !== c.retrograde && STATION_BODIES.includes(body)) {
          const date = a.retrograde !== m.retrograde ? mid : day;
          events.push({ kind: "station", date: date.toISODate()!, body, sign: c.sign, retrograde: c.retrograde });
        }
      }
    }
    prevDay = day;
    prev = now;
  }
  return events.sort((x, y) => x.date.localeCompare(y.date));
}

/** One scan per (day, horizon) per process: the sky is the same for everyone. */
const memo = new Map<string, Promise<SkyEvent[]>>();
export function skyEvents(from: string, months = 12): Promise<SkyEvent[]> {
  const key = `${from}|${months}`;
  let hit = memo.get(key);
  if (!hit) {
    if (memo.size > 8) memo.clear();
    hit = scanSky(from, months).catch((err) => {
      memo.delete(key);
      throw err;
    });
    memo.set(key, hit);
  }
  return hit;
}
