import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildChartSystem, buildTodaySystem } from "./prompt";
import type { Chart } from "./types";

const chart: Chart = {
  tradition: "vedic",
  ascendant: { sign: "Leo", degree: 12.3 },
  houses: Array.from({ length: 12 }, (_, i) => i * 30),
  planets: [
    { name: "Sun", sign: "Sagittarius", degree: 16.5, house: 5, retrograde: false, nakshatra: "Purva Ashadha" },
    { name: "Moon", sign: "Taurus", degree: 3.1, house: 10, retrograde: false, nakshatra: "Krittika" },
  ],
  moonSign: "Taurus",
  sunSign: "Sagittarius",
  ayanamsa: 23.7,
  dasha: {
    mahadasha: "Venus", mahadashaStart: "2015-01-01", mahadashaEnd: "2035-01-01",
    antardasha: "Sun", antardashaStart: "2024-01-01", antardashaEnd: "2025-01-01",
  },
};

describe("buildSystemPrompt", () => {
  it("embeds the tradition, name, ascendant, planetary data, and dasha", () => {
    const p = buildSystemPrompt({ firstName: "Aditi", tradition: "vedic", chart });
    expect(p).toContain("Aditi");
    expect(p).toContain("Vedic");
    expect(p).toContain("Leo"); // ascendant
    expect(p).toContain("Sagittarius"); // sun sign
    expect(p).toContain("Purva Ashadha"); // nakshatra
    expect(p).toContain("Venus"); // mahadasha lord
  });

  it("forbids inventing positions and keeps the guidance disclaimer", () => {
    const p = buildSystemPrompt({ firstName: "Aditi", tradition: "vedic", chart }).toLowerCase();
    expect(p).toContain("never state a placement");
    expect(p).toContain("only this data");
    expect(p).toContain("guidance and reflection");
    expect(p).toContain("in simple words");
  });

  // The chart half carries the cache breakpoint, so anything that changes
  // between turns has to stay out of it or every request is a cache miss.
  it("keeps volatile content out of the cacheable half", () => {
    const stable = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart });
    expect(stable).not.toContain("Today is");
    expect(stable).not.toContain("Sky today");
    expect(stable.toLowerCase()).not.toContain("words or fewer");

    const volatile = buildTodaySystem({
      today: "Wednesday, August 26, 2026, morning",
      transits: "Saturn in Pisces",
      maxWords: 160,
    });
    expect(volatile).toContain("Today is");
    expect(volatile).toContain("Saturn in Pisces");
    expect(volatile).toContain("160 words or fewer");
  });

  it("produces the same cacheable half regardless of the day or length rule", () => {
    const a = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart });
    const b = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart });
    expect(a).toBe(b);
  });
});
