import { DateTime } from "luxon";
import { getSwe } from "@/lib/astrology/chart";
import { NAKSHATRAS, signOf } from "@/lib/astrology/constants";

/**
 * One day's panchang at one place, computed: sunrise to sunset, the five
 * limbs with the moments they change, Rahu Kaal, the good choghadiyas, and
 * Bhadra. No model, no almanac feed.
 */
export type Span = { from: DateTime; to: DateTime };
export type Limb = { index: number; name: string; until: DateTime };
export type PanchangDay = {
  date: string;
  weekday: number; // luxon: Monday 1 ... Sunday 7
  sunrise: DateTime;
  sunset: DateTime;
  /** At sunrise. Tithi index 1..30: 1-15 Shukla, 16-30 Krishna. */
  tithi: Limb;
  nakshatra: Limb;
  yoga: Limb;
  moonSign: string;
  sunSign: string;
  rahuKaal: Span;
  abhijit: Span | null;
  choghadiya: (Span & { name: string })[];
  bhadra: Span[];
};

const TITHI = ["Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi"];
export const tithiName = (n: number) => (n === 15 ? "Purnima" : n === 30 ? "Amavasya" : `${n < 15 ? "Shukla" : "Krishna"} ${TITHI[(n - 1) % 15]}`);

export const YOGAS = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana",
  "Vajra", "Siddhi", "Vyatipata", "Variyana", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];

const CHOGHADIYA = ["Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog"];
/** Which of CHOGHADIYA opens the day, Monday first. */
const FIRST = [3, 6, 2, 5, 1, 4, 0];
const GOOD_CHOGHADIYA = new Set(["Char", "Labh", "Amrit", "Shubh"]);
/** Which eighth of the day is Rahu's, Monday first. */
const RAHU = [2, 7, 5, 6, 4, 3, 8];

/** swisseph's SE_CALC_RISE and SE_CALC_SET, missing from the package's types. */
const CALC_RISE = 1;
const CALC_SET = 2;

const jdOf = (d: DateTime) => d.toMillis() / 86_400_000 + 2440587.5;
const at = (jd: number, zone: string) => DateTime.fromMillis(Math.round((jd - 2440587.5) * 86_400_000), { zone });
const norm = (x: number) => ((x % 360) + 360) % 360;

export type Sky = Awaited<ReturnType<typeof openSky>>;

/** Sidereal longitudes by Julian day. */
export async function openSky() {
  const swe = await getSwe();
  const flags = swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL;
  const lon = (jd: number, body: number): number => {
    swe.set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
    return norm(swe.calc_ut(jd, body, flags)[0]);
  };
  const sun = (jd: number) => lon(jd, swe.SE_SUN);
  const moon = (jd: number) => lon(jd, swe.SE_MOON);
  return {
    sun,
    moon,
    jupiter: (jd: number) => lon(jd, swe.SE_JUPITER),
    venus: (jd: number) => lon(jd, swe.SE_VENUS),
    elongation: (jd: number) => norm(moon(jd) - sun(jd)),
    /** Next sunrise or sunset after `jd`; null where the sun does not rise. */
    rise: (jd: number, lat: number, lng: number, which: "rise" | "set"): number | null => {
      const r = swe.rise_trans(jd, swe.SE_SUN, "", swe.SEFLG_SWIEPH, which === "rise" ? CALC_RISE : CALC_SET, [lng, lat, 0], 0, 0) as Float64Array | null;
      return r && r[0] > jd - 1 ? r[0] : null;
    },
  };
}

/** When `f`, an angle that only grows, next reaches a multiple of `size`. */
function nextChange(f: (jd: number) => number, size: number, jd: number): number {
  const index = (t: number) => Math.floor(f(t) / size);
  const now = index(jd);
  let hi = jd;
  do hi += 0.25;
  while (index(hi) === now && hi - jd < 3);
  let lo = hi - 0.25;
  while (hi - lo > 1 / 86_400) {
    const mid = (lo + hi) / 2;
    if (index(mid) === now) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Null where the sun does not rise or set that day. */
export function panchangDay(sky: Sky, date: string, place: { lat: number; lng: number; timezone: string }): PanchangDay | null {
  const zone = place.timezone;
  const midnight = DateTime.fromISO(date, { zone });
  const rise = sky.rise(jdOf(midnight), place.lat, place.lng, "rise");
  const set = rise === null ? null : sky.rise(rise, place.lat, place.lng, "set");
  if (rise === null || set === null || rise - jdOf(midnight) > 1 || set - rise > 1) return null;

  const tithi = Math.floor(sky.elongation(rise) / 12) + 1;
  const nak = Math.floor((sky.moon(rise) * 27) / 360);
  const yogaAngle = (jd: number) => norm(sky.moon(jd) + sky.sun(jd));
  const yoga = Math.floor((yogaAngle(rise) * 27) / 360);

  const weekday = midnight.weekday;
  const eighth = (set - rise) / 8;
  const part = (n: number): Span => ({ from: at(rise + eighth * n, zone), to: at(rise + eighth * (n + 1), zone) });
  const noon = (rise + set) / 2;
  const half = (set - rise) / 30;

  // Bhadra is the Vishti karana: every seventh half-tithi, eight times a month.
  const bhadra: Span[] = [];
  for (let t = rise; t < set; ) {
    const k = Math.floor(sky.elongation(t) / 6);
    const until = nextChange(sky.elongation, 6, t);
    if (k >= 7 && k <= 56 && k % 7 === 0) bhadra.push({ from: at(t, zone), to: at(Math.min(until, set), zone) });
    t = until + 1 / 86_400;
  }

  return {
    date,
    weekday,
    sunrise: at(rise, zone),
    sunset: at(set, zone),
    tithi: { index: tithi, name: tithiName(tithi), until: at(nextChange(sky.elongation, 12, rise), zone) },
    nakshatra: { index: nak, name: NAKSHATRAS[nak], until: at(nextChange(sky.moon, 360 / 27, rise), zone) },
    yoga: { index: yoga, name: YOGAS[yoga], until: at(nextChange(yogaAngle, 360 / 27, rise), zone) },
    moonSign: signOf(sky.moon(rise)),
    sunSign: signOf(sky.sun(rise)),
    rahuKaal: part(RAHU[weekday - 1] - 1),
    abhijit: weekday === 3 ? null : { from: at(noon - half, zone), to: at(noon + half, zone) },
    choghadiya: Array.from({ length: 8 }, (_, i) => ({ name: CHOGHADIYA[(FIRST[weekday - 1] + i) % 7], ...part(i) })),
    bhadra,
  };
}

export const isGoodChoghadiya = (name: string) => GOOD_CHOGHADIYA.has(name);

/**
 * The lunar month (amanta) a moment falls in, by the Sun's sign at the new
 * moon that began it: 0 Chaitra ... 11 Phalguna. `extra` in an adhika month,
 * when the next new moon finds the Sun in the same sign.
 */
export function lunarMonth(sky: Sky, jd: number): { month: number; extra: boolean } {
  const newMoon = (near: number) => {
    // Elongation wraps at 0: settle on the moment it does.
    let lo = near - 2;
    let hi = near + 2;
    const past = (t: number) => sky.elongation(t) < 180;
    while (hi - lo > 1e-4) {
      const mid = (lo + hi) / 2;
      if (past(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const began = newMoon(jd - sky.elongation(jd) / 12.19);
  const ends = newMoon(began + 29.53);
  const sign = (t: number) => Math.floor(sky.sun(t) / 30);
  const s = sign(began);
  return { month: (s + 1) % 12, extra: sign(ends) === s };
}

export const jdOfDateTime = jdOf;
