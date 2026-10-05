import { describe, it, expect, beforeAll } from "vitest";
import { computeChart } from "./chart";
import { buildChartSystem, moonCertaintyLine, renderChartWithoutTime } from "./prompt";
import { deriveFacts, factsFor } from "./derived";
import { detectNatalDoshas, detectTransitAfflictions } from "./doshas";
import { describeGochara, describeUpcomingTransits } from "./transits";
import type { Chart } from "./types";

/**
 * Unknown birth time: the chart is cast for noon and flagged, and nothing
 * that depends on the hour — ascendant, houses, lordships, Mangal/Pitru
 * dosha, the Moon's exact degree — reaches a reading.
 */

const birth = { birthDate: "1990-01-01", birthTime: "12:00", lat: 28.6139, lng: 77.209, timezone: "Asia/Kolkata" };

let known: Chart;
let unknown: Chart;
let unknownWestern: Chart;

beforeAll(async () => {
  known = await computeChart(birth, "vedic");
  unknown = await computeChart({ ...birth, timeKnown: false }, "vedic");
  unknownWestern = await computeChart({ ...birth, timeKnown: false }, "western");
});

describe("computeChart with an unknown time", () => {
  it("flags the chart and records the Moon's range across the birth date", () => {
    expect(known.timeKnown).toBeUndefined();
    expect(known.moonDay).toBeUndefined();
    expect(unknown.timeKnown).toBe(false);
    expect(unknown.moonDay).toBeDefined();
    const day = unknown.moonDay!;
    expect(day.changesSign).toBe(day.startSign !== day.endSign);
    // The noon Moon lies inside the day's range.
    expect([day.startSign, day.endSign]).toContain(unknown.moonSign);
    expect(day.startNakshatra.length).toBeGreaterThan(0);
  });

  it("keeps the same planets in the same signs as a noon chart", () => {
    expect(unknown.planets.map((p) => [p.name, p.sign])).toEqual(known.planets.map((p) => [p.name, p.sign]));
  });

  it("derives no houses, lordships or house aspects", () => {
    const d = unknown.derived!;
    expect(d.houses).toEqual([]);
    expect(d.planets.every((p) => p.house === 0 && p.rules.length === 0 && p.aspects.length === 0)).toBe(true);
    // Sign-based facts survive.
    expect(d.planets.find((p) => p.name === "Sun")!.dignity).toBeTruthy();
    expect(d.dasha.length).toBe(2);
    expect(factsFor(unknown)).toBe(unknown.derived);
  });
});

describe("conditions that need the ascendant are dropped", () => {
  // Mars in the lagna's own sign: Mangal dosha from the lagna. A node in the
  // 9th: Pitru dosha. Both vanish without a birth time.
  const fixture: Chart = {
    tradition: "vedic",
    ascendant: { sign: "Aries", degree: 10 },
    houses: [],
    planets: [
      { name: "Sun", sign: "Leo", degree: 10, house: 5, retrograde: false },
      { name: "Moon", sign: "Taurus", degree: 10, house: 2, retrograde: false, nakshatra: "Rohini" },
      { name: "Mars", sign: "Aries", degree: 3, house: 1, retrograde: false },
      { name: "Rahu", sign: "Sagittarius", degree: 3, house: 9, retrograde: true },
      { name: "Ketu", sign: "Gemini", degree: 3, house: 3, retrograde: true },
    ],
    moonSign: "Taurus",
    sunSign: "Leo",
  };

  it("in the natal doshas", () => {
    const withTime = detectNatalDoshas(fixture).map((c) => c.kind);
    expect(withTime).toContain("mangal_dosha");
    expect(withTime).toContain("pitru_dosha");
    const noTime = detectNatalDoshas({ ...fixture, timeKnown: false }).map((c) => c.kind);
    expect(noTime).not.toContain("mangal_dosha");
    expect(noTime).not.toContain("pitru_dosha");
    expect(deriveFacts({ ...fixture, timeKnown: false }).conditions.map((c) => c.kind)).toEqual(noTime);
  });

  it("in the transit afflictions", () => {
    const sky: Chart = {
      ...fixture,
      planets: [
        { name: "Saturn", sign: "Cancer", degree: 3, house: 0, retrograde: false },
        { name: "Rahu", sign: "Aries", degree: 3, house: 0, retrograde: true },
      ],
    };
    const withTime = detectTransitAfflictions(fixture, sky).map((c) => c.kind);
    expect(withTime).toContain("kantaka_shani");
    expect(withTime).toContain("node_over_lagna_rahu");
    const noTime = detectTransitAfflictions({ ...fixture, timeKnown: false }, sky).map((c) => c.kind);
    expect(noTime).not.toContain("kantaka_shani");
    expect(noTime.some((k) => k.startsWith("node_over_lagna"))).toBe(false);
  });

  it("in the sky text: houses come from the Moon only", () => {
    const text = describeGochara({ ...fixture, timeKnown: false }, fixture);
    expect(text).not.toMatch(/from the ascendant/);
    expect(text).toMatch(/from the Moon/);
    const ahead = describeUpcomingTransits(
      { ...fixture, timeKnown: false },
      { ...fixture, planets: [{ name: "Saturn", sign: "Pisces", degree: 1, house: 0, retrograde: false }] },
      [{ day: "2027-01-01", chart: { ...fixture, planets: [{ name: "Saturn", sign: "Aries", degree: 1, house: 0, retrograde: false }] } }],
    );
    expect(ahead).toMatch(/Saturn moves into Aries/);
    expect(ahead).not.toMatch(/ascendant/);
  });
});

describe("the reading prompt with an unknown time", () => {
  it("says the time is unknown and forbids lagna, house and pada claims", () => {
    const p = buildChartSystem({ firstName: "Asha", tradition: "vedic", chart: unknown, derived: unknown.derived });
    expect(p).toContain("Ascendant: unknown (no birth time)");
    expect(p).toMatch(/do not know their birth time/i);
    expect(p).toMatch(/never name an ascendant or lagna, a house number, a house lord/i);
    expect(p).toMatch(/nakshatra pada or the Moon's exact degree/i);
    expect(p).toMatch(/transits counted from the natal Moon/i);
    expect(p).toMatch(/dates treated as approximate/i);
    expect(p).toMatch(/suggest adding the birth time/i);
    // No ascendant sign, no HOUSES table, no house numbers.
    expect(p).not.toContain(`Ascendant: ${unknown.ascendant.sign}`);
    expect(p).not.toContain("HOUSES (");
    expect(p).not.toMatch(/house \d/);
    expect(p).toMatch(/the sign that placement is in/);
  });

  it("does not print the Moon's degree", () => {
    const text = renderChartWithoutTime(unknown, unknown.derived);
    const moonLine = text.split("\n").find((l) => l.startsWith("Moon:"))!;
    expect(moonLine).toContain("exact degree unknown");
    expect(moonLine).not.toMatch(/\d+(\.\d+)?°/);
  });

  it("flags a Moon that changed sign that day, and vouches for one that did not", () => {
    const changing: Chart = {
      ...unknown,
      moonDay: { startSign: "Aries", endSign: "Taurus", startNakshatra: "Bharani", endNakshatra: "Krittika", changesSign: true, changesNakshatra: true },
    };
    expect(moonCertaintyLine(changing)).toMatch(/moved from Aries into Taurus/);
    expect(moonCertaintyLine(changing)).toMatch(/uncertain/);
    expect(renderChartWithoutTime(changing, changing.derived)).toMatch(/Bharani or Krittika/);
    const steady: Chart = {
      ...unknown,
      moonDay: { startSign: "Aries", endSign: "Aries", startNakshatra: "Bharani", endNakshatra: "Bharani", changesSign: false, changesNakshatra: false },
      moonSign: "Aries",
    };
    expect(moonCertaintyLine(steady)).toMatch(/stayed in Aries/);
  });

  it("applies to a Western reading too, which has no derived facts", () => {
    const p = buildChartSystem({ firstName: "Asha", tradition: "western", chart: unknownWestern });
    expect(p).toContain("Ascendant: unknown (no birth time)");
    expect(p).not.toMatch(/, h\d/);
    expect(p).toMatch(/Birth time unknown:/);
  });

  it("leaves a chart with a known time exactly as before", () => {
    const p = buildChartSystem({ firstName: "Asha", tradition: "vedic", chart: known, derived: known.derived });
    expect(p).not.toMatch(/Birth time unknown/);
    expect(p).toContain(`Ascendant: ${known.ascendant.sign}`);
    expect(p).toContain("HOUSES (");
    expect(p).toMatch(/the house that placement is in/);
  });
});
