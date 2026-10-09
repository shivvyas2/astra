import { houseFrom, NAKSHATRAS, ORDINAL } from "@/lib/astrology/constants";
import type { Chart } from "@/lib/astrology/types";
import { TOPIC_HOUSES } from "@/lib/memory/topics";
import { TOPIC_LABEL, type Topic } from "@/lib/memory/types";

/**
 * Two dates side by side for one decision: "sign on the 3rd of November or the
 * 1st of December?". Classical muhurta, computed, no model:
 *
 * - Chandra bala: the Moon's house that day counted from the natal Moon.
 * - Tara bala: the day's Moon nakshatra counted from the birth nakshatra.
 * - The slow bodies' gochara from the Moon, and — when a topic is given —
 *   whether Jupiter or a malefic is crossing that topic's houses.
 *
 * The Moon is read at local noon, so a day whose Moon changes nakshatra in
 * the morning or evening is read for the middle of it; the result says so.
 */
export type Factor = { label: string; detail: string; score: -1 | 0 | 1 };
export type DayReading = { date: string; score: number; factors: Factor[]; moonSign: string; nakshatra: string };
export type Comparison = { a: DayReading; b: DayReading; better: "a" | "b" | "even"; topic: Topic | null };

const GOOD_CHANDRA = [1, 3, 6, 7, 10, 11];
const TARAS = ["Janma", "Sampat", "Vipat", "Kshema", "Pratyak", "Sadhana", "Naidhana", "Mitra", "Parama Mitra"];
const GOOD_TARA = new Set(["Sampat", "Kshema", "Sadhana", "Mitra", "Parama Mitra"]);
const BAD_TARA = new Set(["Vipat", "Pratyak", "Naidhana"]);

const GOCHARA_GOOD: Record<string, number[]> = { Jupiter: [2, 5, 7, 9, 11], Saturn: [3, 6, 11], Mars: [3, 6, 11], Rahu: [3, 6, 11] };
const GOCHARA_HARD: Record<string, number[]> = { Jupiter: [8, 12], Saturn: [12, 1, 2, 4, 8], Mars: [1, 8, 12], Rahu: [1, 8, 12] };

export function taraOf(birthNakshatra: string, dayNakshatra: string): string | null {
  const from = NAKSHATRAS.indexOf(birthNakshatra as (typeof NAKSHATRAS)[number]);
  const to = NAKSHATRAS.indexOf(dayNakshatra as (typeof NAKSHATRAS)[number]);
  if (from < 0 || to < 0) return null;
  return TARAS[((to - from + 27) % 27) % 9];
}

export function readDay(natal: Chart, sky: Chart, date: string, topic: Topic | null): DayReading {
  const factors: Factor[] = [];
  const natalMoon = natal.planets.find((p) => p.name === "Moon");
  const moon = sky.planets.find((p) => p.name === "Moon");

  if (moon) {
    const h = houseFrom(natal.moonSign, moon.sign);
    const good = GOOD_CHANDRA.includes(h);
    factors.push({
      label: "Chandra bala",
      detail: `Moon in ${moon.sign}, the ${ORDINAL[h]} from your Moon: ${good ? "favourable" : "not favourable"}.`,
      score: good ? 1 : -1,
    });
    const tara = natalMoon?.nakshatra && moon.nakshatra ? taraOf(natalMoon.nakshatra, moon.nakshatra) : null;
    if (tara) {
      factors.push({
        label: "Tara bala",
        detail: `Moon in ${moon.nakshatra}, ${tara} tara from your ${natalMoon!.nakshatra}.`,
        score: GOOD_TARA.has(tara) ? 1 : BAD_TARA.has(tara) ? -1 : 0,
      });
    }
  }

  for (const body of ["Jupiter", "Saturn", "Mars", "Rahu"]) {
    const p = sky.planets.find((x) => x.name === body);
    if (!p) continue;
    const h = houseFrom(natal.moonSign, p.sign);
    const score = GOCHARA_GOOD[body].includes(h) ? 1 : GOCHARA_HARD[body].includes(h) ? -1 : 0;
    if (score !== 0) {
      factors.push({ label: `${body} gochara`, detail: `${body} in ${p.sign}, the ${ORDINAL[h]} from your Moon.`, score });
    }
  }

  if (topic && natal.timeKnown !== false) {
    const houses = TOPIC_HOUSES[topic];
    for (const p of sky.planets) {
      if (!["Jupiter", "Saturn", "Mars", "Rahu"].includes(p.name)) continue;
      const h = houseFrom(natal.ascendant.sign, p.sign);
      if (!houses.includes(h)) continue;
      const score = p.name === "Jupiter" ? 1 : -1;
      factors.push({
        label: `${TOPIC_LABEL[topic]} houses`,
        detail: `${p.name} is in your ${ORDINAL[h]} house, which ${TOPIC_LABEL[topic].toLowerCase()} is read from.`,
        score,
      });
    }
  }

  return {
    date,
    score: factors.reduce((n, f) => n + f.score, 0),
    factors,
    moonSign: moon?.sign ?? "",
    nakshatra: moon?.nakshatra ?? "",
  };
}

export function compareDays(natal: Chart, a: { date: string; sky: Chart }, b: { date: string; sky: Chart }, topic: Topic | null): Comparison {
  const ra = readDay(natal, a.sky, a.date, topic);
  const rb = readDay(natal, b.sky, b.date, topic);
  return { a: ra, b: rb, better: ra.score === rb.score ? "even" : ra.score > rb.score ? "a" : "b", topic };
}
