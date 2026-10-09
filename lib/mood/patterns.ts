import { houseFrom } from "@/lib/astrology/constants";
import type { Chart } from "@/lib/astrology/types";
import { taraOf } from "@/lib/timing/compare";

/**
 * What a person's own mood check-ins say about their sky: are their days
 * better when the Moon is well placed for them?
 *
 * Each check-in day is split two ways — Chandra bala (the day's Moon in the
 * 1st, 3rd, 6th, 7th, 10th or 11th from the natal Moon, or not) and Tara bala
 * (a good tara or not) — and the average mood on each side is compared. A
 * pattern is only reported when both sides have MIN_DAYS_PER_SIDE days and the
 * gap is at least MIN_GAP; otherwise the honest answer is "no pattern yet",
 * and that is what is shown.
 */
export const MIN_DAYS_PER_SIDE = 5;
export const MIN_GAP = 0.5;

export type Checkin = { day: string; mood: number };
export type Pattern = {
  key: "chandra" | "tara";
  label: string;
  /** Average mood on the favourable side and on the other, to one decimal. */
  good: { mean: number; days: number };
  other: { mean: number; days: number };
  /** good.mean - other.mean. */
  gap: number;
  sentence: string;
};
export type MoodSummary = { days: number; mean: number | null; patterns: Pattern[]; needed: number };

const GOOD_CHANDRA = [1, 3, 6, 7, 10, 11];
const GOOD_TARA = new Set(["Sampat", "Kshema", "Sadhana", "Mitra", "Parama Mitra"]);

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function compare(key: Pattern["key"], label: string, good: number[], other: number[], favourable: string): Pattern | null {
  if (good.length < MIN_DAYS_PER_SIDE || other.length < MIN_DAYS_PER_SIDE) return null;
  const g = mean(good), o = mean(other);
  const gap = round1(g - o);
  if (Math.abs(gap) < MIN_GAP) return null;
  const sentence =
    gap > 0
      ? `On days ${favourable}, you rate your day ${gap.toFixed(1)} higher on average (${good.length} days against ${other.length}).`
      : `Your days are not better when ${favourable}: ${Math.abs(gap).toFixed(1)} lower on average (${good.length} days against ${other.length}).`;
  return { key, label, good: { mean: round1(g), days: good.length }, other: { mean: round1(o), days: other.length }, gap, sentence };
}

/** `moonOn(day)` gives the Moon's sign and nakshatra for a check-in day. */
export function moodPatterns(natal: Chart, checkins: Checkin[], moonOn: (day: string) => { sign: string; nakshatra?: string }): MoodSummary {
  const natalNak = natal.planets.find((p) => p.name === "Moon")?.nakshatra;
  const chandra = { good: [] as number[], other: [] as number[] };
  const tara = { good: [] as number[], other: [] as number[] };
  for (const c of checkins) {
    const moon = moonOn(c.day);
    (GOOD_CHANDRA.includes(houseFrom(natal.moonSign, moon.sign)) ? chandra.good : chandra.other).push(c.mood);
    const t = natalNak && moon.nakshatra ? taraOf(natalNak, moon.nakshatra) : null;
    if (t) (GOOD_TARA.has(t) ? tara.good : tara.other).push(c.mood);
  }
  const patterns = [
    compare("chandra", "Chandra bala", chandra.good, chandra.other, "the Moon is well placed from your Moon"),
    compare("tara", "Tara bala", tara.good, tara.other, "the Moon is in a favourable nakshatra for you"),
  ].filter((p): p is Pattern => p !== null);
  return {
    days: checkins.length,
    mean: checkins.length ? round1(mean(checkins.map((c) => c.mood))) : null,
    patterns,
    needed: Math.max(0, MIN_DAYS_PER_SIDE * 2 - checkins.length),
  };
}
