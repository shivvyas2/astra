import { describe, it, expect } from "vitest";
import { computeChart } from "./chart";

// Reference birth: 1990-01-01, 12:00 local, New Delhi (Asia/Kolkata).
const input = {
  birthDate: "1990-01-01",
  birthTime: "12:00",
  lat: 28.6139,
  lng: 77.209,
  timezone: "Asia/Kolkata",
};

describe("computeChart", () => {
  it("returns 12 house cusps, an ascendant, and all planets for western", async () => {
    const chart = await computeChart(input, "western");
    expect(chart.houses).toHaveLength(12);
    expect(chart.planets.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"]),
    );
    // Sun on Jan 1 is in Capricorn (tropical).
    expect(chart.sunSign).toBe("Capricorn");
    expect(chart.ascendant.degree).toBeGreaterThanOrEqual(0);
    expect(chart.ascendant.degree).toBeLessThan(30);
  });

  it("sidereal (vedic) sun sits ~24° behind tropical, landing in Sagittarius, with nakshatras", async () => {
    const vedic = await computeChart(input, "vedic");
    expect(vedic.sunSign).toBe("Sagittarius");
    expect(vedic.ayanamsa).toBeGreaterThan(22);
    expect(vedic.ayanamsa).toBeLessThan(26);
    const sun = vedic.planets.find((p) => p.name === "Sun")!;
    expect(sun.nakshatra).toBeTruthy();
    expect(vedic.dasha?.mahadasha).toBeTruthy();
    expect(vedic.dasha?.antardasha).toBeTruthy();
  });
});
