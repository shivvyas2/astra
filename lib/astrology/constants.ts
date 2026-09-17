export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

// 27 nakshatras, each 13°20' of the sidereal zodiac.
export const NAKSHATRAS = [
  "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha",
  "Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha",
  "Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada",
  "Uttara Bhadrapada","Revati",
] as const;

export function signOf(longitude: number): string {
  const idx = Math.floor(((longitude % 360) + 360) % 360 / 30);
  return SIGNS[idx];
}

export function degreeInSign(longitude: number): number {
  return (((longitude % 30) + 30) % 30);
}

export function nakshatraOf(longitude: number): string {
  const idx = Math.floor(((longitude % 360) + 360) % 360 / (360 / 27));
  return NAKSHATRAS[idx];
}

/** -1 when the name is not one of the twelve. */
export function signIndex(sign: string): number {
  return SIGNS.indexOf(sign as (typeof SIGNS)[number]);
}

/**
 * The 1-indexed house of `sign` counted from `from` — the classical "Nth from".
 * Returns 0 when either name is unknown, so a caller can tell it apart from a
 * real house number.
 */
export function houseFrom(from: string, sign: string): number {
  const a = signIndex(from);
  const b = signIndex(sign);
  if (a < 0 || b < 0) return 0;
  return ((b - a + 12) % 12) + 1;
}

/**
 * Version 2 moved Vedic charts from Placidus to whole-sign houses. A stored
 * chart below this version has house numbers that disagree with the rashi
 * labels every renderer draws, so readers upgrade it before use.
 */
export const CHART_SCHEMA_VERSION = 2;

/** The classical "Nth from" ordinal, indexed by `houseFrom`'s 1-12 result. */
export const ORDINAL = [
  "", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th",
];
