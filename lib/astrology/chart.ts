import { DateTime } from "luxon";
import SwissEph from "swisseph-wasm";
import type { BirthInput, Chart, MoonDay, Planet, Tradition } from "./types";
import { degreeInSign, nakshatraOf, signOf, houseFrom, SIGNS, CHART_SCHEMA_VERSION } from "./constants";
import { computeVimshottari } from "./dasha";
import { deriveFacts } from "./derived";

export { CHART_SCHEMA_VERSION };

// Lazily initialize the WASM module once per server process.
let swePromise: Promise<InstanceType<typeof SwissEph>> | null = null;
async function getSwe(): Promise<InstanceType<typeof SwissEph>> {
  if (!swePromise) {
    swePromise = (async () => {
      const swe = new SwissEph();
      await swe.initSwissEph();
      return swe;
    })();
  }
  return swePromise;
}

// Planets to compute. Rahu = mean north node; Ketu is derived (node + 180°).
const BODIES = [
  { name: "Sun", key: "SE_SUN" },
  { name: "Moon", key: "SE_MOON" },
  { name: "Mercury", key: "SE_MERCURY" },
  { name: "Venus", key: "SE_VENUS" },
  { name: "Mars", key: "SE_MARS" },
  { name: "Jupiter", key: "SE_JUPITER" },
  { name: "Saturn", key: "SE_SATURN" },
  { name: "Rahu", key: "SE_MEAN_NODE" },
] as const;

function houseOf(longitude: number, cusps: number[]): number {
  const lon = ((longitude % 360) + 360) % 360;
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    if (start <= end) {
      if (lon >= start && lon < end) return i + 1;
    } else {
      // wraps past 360°
      if (lon >= start || lon < end) return i + 1;
    }
  }
  return 1;
}

export async function computeChart(input: BirthInput, tradition: Tradition): Promise<Chart> {
  const swe = await getSwe();

  // 1. Local birth time -> UT.
  const local = DateTime.fromISO(`${input.birthDate}T${input.birthTime}`, { zone: input.timezone });
  const ut = local.toUTC();
  const decimalHour = ut.hour + ut.minute / 60 + ut.second / 3600;
  const jd = swe.julday(ut.year, ut.month, ut.day, decimalHour);

  // 2. Flags: sidereal (Lahiri) for vedic, tropical for western. Always want speed for retrograde.
  let iflag = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;
  let ayanamsa: number | undefined;
  if (tradition === "vedic") {
    swe.set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
    iflag |= swe.SEFLG_SIDEREAL;
    ayanamsa = swe.get_ayanamsa_ut(jd);
  }

  // 3. Houses + ascendant. 'P' = Placidus. In sidereal mode swisseph applies ayanamsa to cusps too.
  //    houses_ex returns { cusps: Float64Array[13] (1..12 used), ascmc: Float64Array[10] ([0]=Asc) }.
  const housesRes = swe.houses_ex(jd, iflag, input.lat, input.lng, "P");
  const cusps: number[] = Array.from(housesRes.cusps).slice(1, 13);
  const ascLon: number = housesRes.ascmc[0];
  const ascSign = signOf(ascLon);

  // 4. Planets. calc_ut returns Float64Array [lon, lat, dist, lonSpeed, latSpeed, distSpeed].
  const planets: Planet[] = [];
  let moonAbsLon = 0; // sidereal absolute longitude of the Moon, for the dasha calc
  for (const body of BODIES) {
    const res = swe.calc_ut(jd, swe[body.key], iflag);
    const lon: number = res[0];
    const speed: number = res[3];
    if (body.name === "Moon") moonAbsLon = ((lon % 360) + 360) % 360;
    planets.push({
      name: body.name,
      sign: signOf(lon),
      degree: Number(degreeInSign(lon).toFixed(2)),
      house: tradition === "vedic" ? houseFrom(ascSign, signOf(lon)) : houseOf(lon, cusps),
      retrograde: speed < 0,
      nakshatra: tradition === "vedic" ? nakshatraOf(lon) : undefined,
    });
  }
  // Ketu = Rahu + 180°. Reconstruct Rahu's absolute longitude from its sign + degree.
  const rahu = planets.find((p) => p.name === "Rahu")!;
  const rahuLon = SIGNS.indexOf(rahu.sign as (typeof SIGNS)[number]) * 30 + rahu.degree;
  const ketuLon = (rahuLon + 180) % 360;
  planets.push({
    name: "Ketu",
    sign: signOf(ketuLon),
    degree: Number(degreeInSign(ketuLon).toFixed(2)),
    house: tradition === "vedic" ? houseFrom(ascSign, signOf(ketuLon)) : houseOf(ketuLon, cusps),
    retrograde: true,
    nakshatra: tradition === "vedic" ? nakshatraOf(ketuLon) : undefined,
  });

  const sun = planets.find((p) => p.name === "Sun")!;
  const moon = planets.find((p) => p.name === "Moon")!;

  const result: Chart = {
    tradition,
    ascendant: { sign: ascSign, degree: Number(degreeInSign(ascLon).toFixed(2)) },
    houses: cusps.map((c) => Number(c.toFixed(2))),
    planets,
    moonSign: moon.sign,
    sunSign: sun.sign,
    ayanamsa: ayanamsa !== undefined ? Number(ayanamsa.toFixed(3)) : undefined,
    dasha: tradition === "vedic" ? computeVimshottari(moonAbsLon, ut) : undefined,
    schemaVersion: CHART_SCHEMA_VERSION,
  };
  if (input.timeKnown === false) {
    result.timeKnown = false;
    result.moonDay = moonAcrossTheDay(swe, input, iflag);
  }
  // Every technique in derived.ts — lordship, graha drishti, moolatrikona,
  // combustion orbs, the natal doshas — is Vedic. Western continues to use
  // Placidus houses (set above) and gets no derived block at all; see
  // docs/design/2026-09-17-specific-readings.md §0.
  return { ...result, derived: tradition === "vedic" ? deriveFacts(result) : undefined };
}

/**
 * The Moon at 00:00 and 23:59 local on the birth date. It moves about 13° a
 * day, so for someone who does not know their birth time this is the honest
 * range: if both ends share a sign, the Moon sign is certain; if not, the
 * reading has to say so.
 */
function moonAcrossTheDay(
  swe: InstanceType<typeof SwissEph>,
  input: BirthInput,
  iflag: number,
): MoonDay {
  const at = (time: string) => {
    const ut = DateTime.fromISO(`${input.birthDate}T${time}`, { zone: input.timezone }).toUTC();
    const jd = swe.julday(ut.year, ut.month, ut.day, ut.hour + ut.minute / 60 + ut.second / 3600);
    return swe.calc_ut(jd, swe.SE_MOON, iflag)[0] as number;
  };
  const start = at("00:00");
  const end = at("23:59");
  const sidereal = (iflag & swe.SEFLG_SIDEREAL) !== 0;
  const startNakshatra = sidereal ? nakshatraOf(start) : "";
  const endNakshatra = sidereal ? nakshatraOf(end) : "";
  return {
    startSign: signOf(start),
    endSign: signOf(end),
    startNakshatra,
    endNakshatra,
    changesSign: signOf(start) !== signOf(end),
    changesNakshatra: startNakshatra !== endNakshatra,
  };
}
