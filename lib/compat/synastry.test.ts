import { describe, it, expect } from "vitest";
import type { Chart } from "@/lib/astrology/types";
import { aspectBetween, computeSynastry, elementOf, elementRelation, tropicalPoints } from "./synastry";

function chart(points: Record<string, [string, number]>, extra: Partial<Chart> = {}): Chart {
  const planets = Object.entries(points)
    .filter(([name]) => name !== "Ascendant")
    .map(([name, [sign, degree]]) => ({ name, sign, degree, house: 0, retrograde: false }));
  const asc = points.Ascendant ?? ["Aries", 0];
  return {
    tradition: "western",
    ascendant: { sign: asc[0], degree: asc[1] },
    houses: [],
    planets,
    moonSign: points.Moon?.[0] ?? "Aries",
    sunSign: points.Sun?.[0] ?? "Aries",
    ...extra,
  };
}

const vedicStub = (extra: Partial<Chart> = {}): Chart => ({ ...chart({}), tradition: "vedic", ...extra });

describe("aspects", () => {
  it("finds the closest aspect within orb, wider for the luminaries", () => {
    expect(aspectBetween(10, 130, "Venus", "Mars")).toEqual({ aspect: "trine", orb: 0 });
    expect(aspectBetween(10, 197, "Venus", "Mars")).toEqual({ aspect: "opposition", orb: 7 });
    // 9° from a conjunction: outside Venus–Mars (8°), inside Sun–Moon (10°).
    expect(aspectBetween(0, 9, "Venus", "Mars")).toBeNull();
    expect(aspectBetween(0, 9, "Sun", "Moon")).toEqual({ aspect: "conjunction", orb: 9 });
    // Wraps across 0° Aries.
    expect(aspectBetween(355, 85, "Venus", "Venus")).toEqual({ aspect: "square", orb: 0 });
  });

  it("classes elements and their harmony", () => {
    expect(elementOf("Leo")).toBe("Fire");
    expect(elementOf("Capricorn")).toBe("Earth");
    expect(elementOf("Aquarius")).toBe("Air");
    expect(elementOf("Pisces")).toBe("Water");
    expect(elementRelation("Fire", "Air")).toBe("compatible");
    expect(elementRelation("Water", "Earth")).toBe("compatible");
    expect(elementRelation("Fire", "Water")).toBe("mismatched");
    expect(elementRelation("Air", "Air")).toBe("same");
  });
});

describe("computeSynastry", () => {
  const a = {
    vedic: vedicStub(),
    western: chart({ Sun: ["Leo", 10], Moon: ["Aries", 12], Venus: ["Gemini", 5], Mars: ["Libra", 20], Ascendant: ["Sagittarius", 3] }),
  };
  const harmonious = {
    vedic: vedicStub(),
    western: chart({ Sun: ["Sagittarius", 11], Moon: ["Leo", 13], Venus: ["Aquarius", 6], Mars: ["Libra", 5], Ascendant: ["Aries", 2] }),
  };
  const tense = {
    vedic: vedicStub(),
    western: chart({ Sun: ["Scorpio", 10], Moon: ["Cancer", 12], Venus: ["Virgo", 5], Mars: ["Capricorn", 20], Ascendant: ["Pisces", 3] }),
  };

  it("scores a fire/air pair with trines well above a pair of squares", () => {
    const good = computeSynastry(a, harmonious);
    const hard = computeSynastry(a, tense);
    expect(good.score0to100).toBeGreaterThan(70);
    expect(hard.score0to100).toBeLessThan(40);
    expect(good.aspects.some((x) => x.a === "Sun" && x.b === "Sun" && x.aspect === "trine")).toBe(true);
    expect(hard.aspects.some((x) => x.tone === "challenging")).toBe(true);
    for (const s of [good, hard]) {
      expect(s.score0to100).toBeGreaterThanOrEqual(0);
      expect(s.score0to100).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic", () => {
    expect(computeSynastry(a, harmonious)).toEqual(computeSynastry(a, harmonious));
  });

  it("leaves out the Ascendant and flags the Moon when a birth time is unknown", () => {
    const unknown = { vedic: vedicStub({ timeKnown: false }), western: harmonious.western };
    const s = computeSynastry(a, unknown);
    expect(s.aspects.every((x) => x.b !== "Ascendant")).toBe(true);
    expect(s.aspects.filter((x) => x.b === "Moon").every((x) => x.uncertain)).toBe(true);
    expect(Object.values(s.elements.b).reduce((n, v) => n + v, 0)).toBe(4);
  });

  it("derives tropical positions from sidereal plus ayanamsa when no Western chart is stored", () => {
    const vedic: Chart = {
      ...chart({ Sun: ["Cancer", 20], Moon: ["Aries", 0], Venus: ["Gemini", 29], Mars: ["Libra", 1], Ascendant: ["Leo", 6] }),
      tradition: "vedic",
      ayanamsa: 24,
    };
    const p = tropicalPoints({ vedic });
    expect(p.Sun).toBeCloseTo(90 + 20 + 24); // 14° Leo
    expect(p.Venus).toBeCloseTo((60 + 29 + 24) % 360); // 23° Cancer
    expect(p.Ascendant).toBeCloseTo(120 + 6 + 24);
  });
});
