import { describe, it, expect } from "vitest";
import {
  hash32,
  discoveryPlan,
  chartFacts,
  numerologyFacts,
  fallbackDiscovery,
  DISCOVERY_DAYS_IN_SEVEN,
  DISCOVERY_HOURS,
} from "./discoveries";
import type { Derived } from "@/lib/astrology/derived";

describe("hash32", () => {
  it("is stable and spreads", () => {
    expect(hash32("a")).toBe(hash32("a"));
    expect(hash32("a")).not.toBe(hash32("b"));
    expect(hash32("")).toBe(0x811c9dc5);
  });
});

describe("discoveryPlan", () => {
  it("gives the same answer for the same person and day, however often it is asked", () => {
    expect(discoveryPlan("u1", "2026-10-05")).toEqual(discoveryPlan("u1", "2026-10-05"));
  });

  it("lands about three days in seven, in the afternoon window", () => {
    let days = 0;
    let hits = 0;
    for (let d = 0; d < 700; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      days += 1;
      const plan = discoveryPlan("user-abc", date);
      if (!plan) continue;
      hits += 1;
      expect(plan.hour).toBeGreaterThanOrEqual(DISCOVERY_HOURS.start);
      expect(plan.hour).toBeLessThan(DISCOVERY_HOURS.end);
      expect(["chart", "numerology", "sky", "prediction"]).toContain(plan.topic);
    }
    const rate = hits / days;
    expect(rate).toBeGreaterThan((DISCOVERY_DAYS_IN_SEVEN - 1) / 7);
    expect(rate).toBeLessThan((DISCOVERY_DAYS_IN_SEVEN + 1) / 7);
  });

  it("does not give everyone the same day or hour", () => {
    const plans = ["a", "b", "c", "d", "e", "f", "g", "h"].map((u) => discoveryPlan(u, "2026-10-05"));
    const hours = new Set(plans.filter(Boolean).map((p) => p!.hour));
    expect(plans.some((p) => p === null)).toBe(true);
    expect(hours.size).toBeGreaterThan(1);
  });
});

describe("chartFacts", () => {
  const derived: Derived = {
    planets: [
      { name: "Jupiter", sign: "Cancer", degree: 5, house: 10, retrograde: false, rules: [4, 7], dignity: "exalted", combust: false, aspects: [], aspectsPlanets: [], conjunct: [] },
      { name: "Mercury", sign: "Leo", degree: 2, house: 11, retrograde: true, rules: [9, 12], dignity: "neutral", combust: true, aspects: [], aspectsPlanets: [], conjunct: ["Sun"] },
    ],
    houses: [{ number: 10, sign: "Cancer", lord: "Moon", lordHouse: 4, lordSign: "Capricorn", lordDignity: "neutral", occupants: ["Jupiter"], aspectedBy: [] }],
    dasha: [{ level: "mahadasha", lord: "Saturn", start: "2020-01-01", end: "2039-01-01" }],
    conditions: [],
  };

  it("turns the computed facts into plain sentences", () => {
    const facts = chartFacts(derived);
    expect(facts).toContain("Jupiter is exalted in Cancer, in your 10th house, and it rules your 4th and 7th houses.");
    expect(facts.some((f) => f.startsWith("Mercury was retrograde"))).toBe(true);
    expect(facts.some((f) => f.includes("combust"))).toBe(true);
    expect(facts).toContain("Mercury is conjunct Sun in Leo, your 11th house.");
    expect(facts).toContain("The lord of your 10th house, Moon, sits in your 4th house in Capricorn.");
    expect(facts).toContain("You are in your Saturn mahadasha until 2039-01-01.");
  });
});

describe("numerologyFacts", () => {
  it("always has the core numbers and the personal cycle", () => {
    const facts = numerologyFacts("1995-08-14", "2026-10-05");
    expect(facts[0]).toMatch(/root number is \d and your destiny number is \d/);
    expect(facts[1]).toMatch(/personal year \d/);
    expect(facts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("fallbackDiscovery", () => {
  it("keeps the body to a lock screen and the fact in the detail", () => {
    const long = "A".repeat(200) + ". More.";
    const copy = fallbackDiscovery({ topic: "chart", text: long });
    expect(copy.body.length).toBeLessThanOrEqual(140);
    expect(copy.detail).toContain(long);
    expect(copy.detail).toContain("In simple words");
  });
});
