import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt";
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

  it("instructs the model not to invent positions and to include a disclaimer", () => {
    const p = buildSystemPrompt({ firstName: "Aditi", tradition: "vedic", chart });
    expect(p.toLowerCase()).toContain("do not invent");
    expect(p.toLowerCase()).toContain("guidance");
  });
});
