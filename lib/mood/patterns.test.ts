import { describe, it, expect } from "vitest";
import { moodPatterns, MIN_DAYS_PER_SIDE } from "./patterns";
import type { Chart } from "@/lib/astrology/types";

const natal = { moonSign: "Leo", planets: [{ name: "Moon", sign: "Leo", nakshatra: "Magha" }] } as unknown as Chart;
// Libra is 3rd from Leo (good Chandra bala); Capricorn is 6th (good); Virgo 2nd and Pisces 8th are not.
const MOON: Record<string, { sign: string; nakshatra: string }> = {
  good: { sign: "Libra", nakshatra: "Swati" }, // Sadhana tara: good
  bad: { sign: "Pisces", nakshatra: "Revati" }, // 8th from Leo; Parama Mitra tara, so only Chandra bala differs
};

function days(n: number, kind: "good" | "bad", mood: number) {
  return Array.from({ length: n }, (_, i) => ({ day: `${kind}-${i}`, mood }));
}
const moonOn = (day: string) => (day.startsWith("good") ? MOON.good : MOON.bad);

describe("moodPatterns", () => {
  it("reports a Chandra bala pattern when both sides have enough days and the gap is real", () => {
    const s = moodPatterns(natal, [...days(6, "good", 4), ...days(6, "bad", 2)], moonOn);
    const chandra = s.patterns.find((p) => p.key === "chandra")!;
    expect(chandra).toMatchObject({ gap: 2, good: { mean: 4, days: 6 }, other: { mean: 2, days: 6 } });
    expect(chandra.sentence).toBe("On days the Moon is well placed from your Moon, you rate your day 2.0 higher on average (6 days against 6).");
    expect(s).toMatchObject({ days: 12, mean: 3, needed: 0 });
  });

  it("says nothing until each side has enough days", () => {
    const s = moodPatterns(natal, [...days(MIN_DAYS_PER_SIDE - 1, "good", 5), ...days(8, "bad", 1)], moonOn);
    expect(s.patterns.find((p) => p.key === "chandra")).toBeUndefined();
  });

  it("says nothing when the gap is small", () => {
    const s = moodPatterns(natal, [...days(6, "good", 3), ...days(6, "bad", 3)], moonOn);
    expect(s.patterns).toEqual([]);
  });

  it("states a reversed pattern plainly rather than hiding it", () => {
    const s = moodPatterns(natal, [...days(6, "good", 2), ...days(6, "bad", 4)], moonOn);
    expect(s.patterns.find((p) => p.key === "chandra")!.sentence).toMatch(/^Your days are not better when/);
  });

  it("counts how many more check-ins are needed", () => {
    expect(moodPatterns(natal, days(3, "good", 3), moonOn).needed).toBe(MIN_DAYS_PER_SIDE * 2 - 3);
    expect(moodPatterns(natal, [], moonOn)).toMatchObject({ days: 0, mean: null });
  });
});
