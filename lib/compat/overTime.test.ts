import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { lordsRelation, overTime, relationshipWeight } from "./overTime";
import type { Chart } from "@/lib/astrology/types";

// Aries rising: Libra is the 7th, so Venus rules it; Virgo is the 6th.
const chart = (planets: [string, string][], moon: [string, number] = ["Taurus", 10], timeKnown = true) =>
  ({
    ascendant: { sign: "Aries", degree: 5 },
    moonSign: moon[0],
    timeKnown,
    planets: [{ name: "Moon", sign: moon[0], degree: moon[1] }, ...planets.map(([name, sign]) => ({ name, sign, degree: 10 }))],
  }) as unknown as Chart;

describe("relationshipWeight", () => {
  it("counts a lord in the 7th, ruling the 7th, or Venus as speaking for relationships", () => {
    expect(relationshipWeight(chart([["Jupiter", "Libra"]]), "Jupiter", "Asha").weight).toBe(1);
    expect(relationshipWeight(chart([["Venus", "Gemini"]]), "Venus", "Asha").reason).toContain("rules their 7th");
    expect(relationshipWeight(chart([["Saturn", "Virgo"]]), "Saturn", "Asha")).toMatchObject({ weight: -1 });
    expect(relationshipWeight(chart([["Sun", "Leo"]]), "Sun", "Asha")).toEqual({ weight: 0, reason: null });
  });

  it("counts from the Moon when the birth time is unknown", () => {
    // Moon in Taurus: Scorpio is the 7th from it.
    const r = relationshipWeight(chart([["Mars", "Scorpio"]], ["Taurus", 10], false), "Mars", "Asha");
    expect(r.reason).toContain("7th from the Moon");
  });
});

describe("lordsRelation", () => {
  it("reads the two running lords' natural relationship both ways", () => {
    expect(lordsRelation("Sun", "Jupiter").score).toBe(1);
    expect(lordsRelation("Sun", "Saturn").score).toBe(-1);
    expect(lordsRelation("Moon", "Jupiter").score).toBe(0);
    expect(lordsRelation("Venus", "Venus").score).toBe(1);
    expect(lordsRelation("Ketu", "Saturn")).toMatchObject({ score: 0, reason: expect.stringContaining("no natural friendships") });
  });
});

describe("overTime", () => {
  it("cuts the years at every sub-period change of either person and joins identical neighbours", () => {
    const you = { name: "Asha", chart: chart([["Venus", "Libra"], ["Saturn", "Virgo"]]), birthUt: DateTime.fromISO("1995-04-12T01:00:00Z") };
    const them = { name: "Ravi", chart: chart([["Jupiter", "Libra"]], ["Cancer", 3]), birthUt: DateTime.fromISO("1993-08-02T05:00:00Z") };
    const stretches = overTime(you, them, "2026-10-09", 3);
    expect(stretches.length).toBeGreaterThan(0);
    expect(stretches[0].start).toBe("2026-10-09");
    expect(stretches[stretches.length - 1].end).toBe("2029-10-09");
    for (let i = 1; i < stretches.length; i++) {
      expect(stretches[i].start).toBe(stretches[i - 1].end);
      const same = stretches[i].you === stretches[i - 1].you && stretches[i].them === stretches[i - 1].them && stretches[i].tone === stretches[i - 1].tone;
      expect(same).toBe(false);
    }
    for (const s of stretches) expect(s.reasons.length).toBeGreaterThan(0);
  });
});
