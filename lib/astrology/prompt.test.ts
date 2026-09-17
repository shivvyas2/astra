import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildChartSystem, buildTodaySystem } from "./prompt";
import { deriveFacts } from "./derived";
import type { Chart } from "./types";

const chart: Chart = {
  tradition: "vedic",
  ascendant: { sign: "Leo", degree: 12.3 },
  houses: Array.from({ length: 12 }, (_, i) => i * 30),
  planets: [
    { name: "Sun", sign: "Sagittarius", degree: 16.5, house: 5, retrograde: false, nakshatra: "Purva Ashadha" },
    { name: "Moon", sign: "Taurus", degree: 3.1, house: 10, retrograde: false, nakshatra: "Krittika" },
    { name: "Venus", sign: "Libra", degree: 10, house: 3, retrograde: false, nakshatra: "Swati" },
  ],
  moonSign: "Taurus",
  sunSign: "Sagittarius",
  ayanamsa: 23.7,
  dasha: {
    mahadasha: "Venus", mahadashaStart: "2015-01-01", mahadashaEnd: "2035-01-01",
    antardasha: "Sun", antardashaStart: "2024-01-01", antardashaEnd: "2025-01-01",
  },
};

// Computed once so every test reads the same facts the prompt is rendered from.
const derived = deriveFacts(chart);

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
    const stable = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });
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
    const a = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });
    const b = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });
    expect(a).toBe(b);
  });
});

describe("buildTodaySystem transit framing", () => {
  it("puts the instruction on its own line, with no double period, when transits are a multi-line block", () => {
    const transits = "- Saturn in Pisces, house 5 from the ascendant, 11th from the Moon.\n- Jupiter in Gemini, house 10 from the ascendant, 4th from the Moon.";
    const p = buildTodaySystem({ today: "Wednesday, August 26, 2026, morning", transits });

    expect(p).not.toContain("..");
    const lines = p.split("\n");
    const instructionLine = lines.find((l) => l.includes("For anything about now"));
    expect(instructionLine).toBeDefined();
    // The instruction reads as a directive on its own line, not glued onto a bullet.
    expect(instructionLine).not.toMatch(/^- /);
    expect(instructionLine?.trim().startsWith("For anything about now")).toBe(true);
    // Both bullets survive intact, each on their own line.
    expect(p).toContain("- Saturn in Pisces, house 5 from the ascendant, 11th from the Moon.");
    expect(p).toContain("- Jupiter in Gemini, house 10 from the ascendant, 4th from the Moon.");
  });
});

describe("derived facts in the prompt", () => {
  const p = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });

  it("names what each planet rules and how strong it is", () => {
    expect(p).toMatch(/Sun:[^\n]*rules house/);
    expect(p).toMatch(/Moon:[^\n]*(exalted|debilitated|own|moolatrikona|neutral)/);
  });

  it("names the houses each planet aspects", () => {
    expect(p).toMatch(/aspects houses/);
  });

  it("gives every house its lord and where that lord sits", () => {
    expect(p).toContain("HOUSES");
    expect(p).toMatch(/House 7[^\n]*lord [A-Z][a-z]+ in house \d+/);
  });

  it("says where the dasha lord actually sits", () => {
    expect(p).toContain("Venus");
    expect(p).toMatch(/mahadasha[^]*Venus[^]*house \d+/i);
  });

  it("bans the generic register outright", () => {
    const lower = p.toLowerCase();
    expect(lower).toContain("true of a twelfth of the population");
  });

  it("still forbids inventing placements", () => {
    expect(p.toLowerCase()).toContain("never state a placement");
  });
});
