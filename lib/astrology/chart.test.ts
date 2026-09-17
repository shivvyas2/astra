import { describe, it, expect } from "vitest";
import { computeChart, CHART_SCHEMA_VERSION } from "./chart";
import { houseFrom } from "./constants";
import { factsFor, isChartStale } from "./derived";

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

describe("vedic houses are whole-sign", () => {
  it("places every planet in the Nth sign from the lagna", async () => {
    const chart = await computeChart(input, "vedic");
    for (const p of chart.planets) {
      expect(p.house).toBe(houseFrom(chart.ascendant.sign, p.sign));
    }
  });

  it("puts a planet in the lagna's own sign into house 1, whatever its degree", async () => {
    const chart = await computeChart(input, "vedic");
    const inLagnaSign = chart.planets.filter((p) => p.sign === chart.ascendant.sign);
    for (const p of inLagnaSign) expect(p.house).toBe(1);
  });

  it("stamps the schema version", async () => {
    const chart = await computeChart(input, "vedic");
    expect(chart.schemaVersion).toBe(CHART_SCHEMA_VERSION);
  });

  it("leaves western on Placidus, where a planet can sit in a house whose cusp sign differs", async () => {
    const chart = await computeChart(input, "western");
    // Placidus houses are unequal, so at least one planet will not match
    // whole-sign counting for a chart with a mid-sign ascendant.
    const matches = chart.planets.map((p) => p.house === houseFrom(chart.ascendant.sign, p.sign));
    expect(matches.every(Boolean)).toBe(false);
  });
});

describe("derived facts on a computed chart", () => {
  it("are stored, and carry a lord for every house", async () => {
    const chart = await computeChart(input, "vedic");
    expect(chart.derived?.houses).toHaveLength(12);
    expect(chart.derived?.houses.every((h) => h.lord.length > 0)).toBe(true);
    expect(isChartStale(chart)).toBe(false);
  });

  it("factsFor uses the stored block when present and computes when absent", async () => {
    const chart = await computeChart(input, "vedic");
    expect(factsFor(chart)).toBe(chart.derived);
    const legacy = { ...chart, derived: undefined, schemaVersion: undefined };
    expect(isChartStale(legacy)).toBe(true);
    expect(factsFor(legacy).houses).toHaveLength(12);
  });
});
