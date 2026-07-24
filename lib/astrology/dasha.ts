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

// `now` is injectable so tests are deterministic.
export function computeVimshottari(
  moonSiderealLongitude: number,
  birthUt: DateTime,
  now: DateTime = DateTime.utc(),
): DashaInfo {
  const lon = ((moonSiderealLongitude % 360) + 360) % 360;
  const nakIndex = Math.floor(lon / NAK_SPAN);
  const startLordIndex = nakIndex % 9;
  const fractionElapsed = (lon - nakIndex * NAK_SPAN) / NAK_SPAN;

  // Mahadasha periods forward from birth; the first is the *balance* of the running dasha.
  const periods: { lord: string; start: DateTime; end: DateTime }[] = [];
  let cursor = birthUt;
  const firstYears = ORDER[startLordIndex].years * (1 - fractionElapsed);
  periods.push({ lord: ORDER[startLordIndex].lord, start: cursor, end: (cursor = addYears(cursor, firstYears)) });
  for (let i = 1; i < 12; i++) {
    const o = ORDER[(startLordIndex + i) % 9];
    periods.push({ lord: o.lord, start: cursor, end: (cursor = addYears(cursor, o.years)) });
  }

  const maha = periods.find((p) => now >= p.start && now < p.end) ?? periods[0];
  const mahaFullYears = ORDER.find((o) => o.lord === maha.lord)!.years;
  const mahaLordIndex = ORDER.findIndex((o) => o.lord === maha.lord);

  // Antardashas within the current mahadasha, in Vimshottari order from the maha lord.
  let aCursor = maha.start;
  let antar = { lord: maha.lord, start: maha.start, end: maha.end };
  for (let i = 0; i < 9; i++) {
    const sub = ORDER[(mahaLordIndex + i) % 9];
    const end = addYears(aCursor, (mahaFullYears * sub.years) / TOTAL);
    if (now >= aCursor && now < end) { antar = { lord: sub.lord, start: aCursor, end }; break; }
    aCursor = end;
  }

  return {
    mahadasha: maha.lord,
    mahadashaStart: maha.start.toISODate()!,
    mahadashaEnd: maha.end.toISODate()!,
    antardasha: antar.lord,
    antardashaStart: antar.start.toISODate()!,
    antardashaEnd: antar.end.toISODate()!,
  };
}
