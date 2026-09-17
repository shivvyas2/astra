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
