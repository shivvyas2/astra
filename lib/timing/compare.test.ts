import { describe, it, expect } from "vitest";
import { compareDays, readDay, taraOf } from "./compare";
import type { Chart } from "@/lib/astrology/types";

const natal = {
  ascendant: { sign: "Pisces", degree: 10 },
  moonSign: "Leo",
  planets: [{ name: "Moon", sign: "Leo", degree: 12, house: 6, retrograde: false, nakshatra: "Magha" }],
} as unknown as Chart;

const sky = (moon: [string, string], others: [string, string][] = []) =>
  ({ planets: [{ name: "Moon", sign: moon[0], nakshatra: moon[1] }, ...others.map(([name, sign]) => ({ name, sign }))] }) as unknown as Chart;

describe("taraOf", () => {
  it("counts the day's nakshatra from the birth nakshatra in nines", () => {
    expect(taraOf("Magha", "Magha")).toBe("Janma");
    expect(taraOf("Magha", "Purva Phalguni")).toBe("Sampat");
    expect(taraOf("Magha", "Mula")).toBe("Janma"); // ten on: the cycle starts again
    expect(taraOf("Revati", "Ashwini")).toBe("Sampat"); // wraps round the zodiac
    expect(taraOf("Magha", "Nowhere")).toBeNull();
  });
});

describe("readDay", () => {
  it("scores Chandra bala, Tara bala and the slow bodies from the Moon", () => {
    const r = readDay(natal, sky(["Libra", "Swati"], [["Jupiter", "Libra"], ["Saturn", "Capricorn"]]), "2026-11-03", null);
    // Libra is 3rd from Leo (favourable); Swati is Sadhana tara from Magha (good);
    // Jupiter in the 3rd is neither; Saturn in the 6th is favourable.
    expect(r.factors.map((f) => [f.label, f.score])).toEqual([
      ["Chandra bala", 1],
      ["Tara bala", 1],
      ["Saturn gochara", 1],
    ]);
    expect(r.score).toBe(3);
  });

  it("adds the topic's houses from the ascendant: Jupiter helps, a malefic hurts", () => {
    // Career reads from the 10th (Sagittarius) and 6th (Leo) for a Pisces ascendant.
    const r = readDay(natal, sky(["Leo", "Magha"], [["Jupiter", "Sagittarius"], ["Mars", "Leo"]]), "2026-12-01", "career");
    expect(r.factors.filter((f) => f.label === "Career houses").map((f) => f.score)).toEqual([1, -1]);
  });
});

describe("compareDays", () => {
  it("prefers the day with the higher score, and calls a tie even", () => {
    const good = { date: "2026-11-03", sky: sky(["Libra", "Swati"]) };
    const bad = { date: "2026-12-01", sky: sky(["Cancer", "Ashlesha"]) };
    expect(compareDays(natal, good, bad, null).better).toBe("a");
    expect(compareDays(natal, bad, good, null).better).toBe("b");
    expect(compareDays(natal, good, good, null).better).toBe("even");
  });
});
