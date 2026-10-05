import type { Derived } from "./derived";

export type Tradition = "vedic" | "western";

// A chat can run in an astrology tradition or in numerology mode.
export type ChatMode = "vedic" | "western" | "numerology";

export type BirthInput = {
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:mm
  lat: number;
  lng: number;
  timezone: string; // IANA
  /**
   * False when the person does not know their birth time. `birthTime` is then
   * noon (or a rough part of the day they chose) and nothing that depends on
   * the exact hour — the ascendant, houses, the Moon's exact degree — is
   * trusted downstream. Absent means known.
   */
  timeKnown?: boolean;
};

/**
 * Where the Moon was at the first and last minute of the birth date, in the
 * birthplace's own clock. Only computed when the birth time is unknown: it is
 * what says whether "Moon in Taurus" is a fact or a guess.
 */
export type MoonDay = {
  startSign: string;
  endSign: string;
  startNakshatra: string;
  endNakshatra: string;
  changesSign: boolean;
  changesNakshatra: boolean;
};

export type Planet = {
  name: string;
  sign: string;
  degree: number;
  house: number;
  retrograde: boolean;
  nakshatra?: string;
};

export type DashaInfo = {
  mahadasha: string;
  mahadashaStart: string; // ISO date
  mahadashaEnd: string;
  antardasha: string;
  antardashaStart: string;
  antardashaEnd: string;
};

export type Chart = {
  tradition: Tradition;
  ascendant: { sign: string; degree: number };
  houses: number[]; // 12 cusp longitudes
  planets: Planet[];
  moonSign: string;
  sunSign: string;
  ayanamsa?: number;
  dasha?: DashaInfo; // Vedic only — current Vimshottari mahadasha/antardasha
  /** Bumped when the computation changes in a way that moves stored values. */
  schemaVersion?: number;
  /** Classical readings of the positions above. See lib/astrology/derived.ts. */
  derived?: Derived;
  /** False when the birth time is unknown. Absent (every older chart) means known. */
  timeKnown?: boolean;
  /** Present only when `timeKnown` is false. */
  moonDay?: MoonDay;
};
