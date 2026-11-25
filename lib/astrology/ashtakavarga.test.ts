import { describe, expect, it } from "vitest";
import { ashtakavarga, BINDUS, describeAshtakavarga, type AvPlanet } from "./ashtakavarga";
import { computeChart } from "./chart";

const TOTALS: Record<AvPlanet, number> = { Sun: 48, Moon: 49, Mars: 39, Mercury: 54, Jupiter: 56, Venus: 52, Saturn: 39 };

describe("ashtakavarga", () => {
  it("has the classical totals, with no house listed twice", () => {
    for (const [p, total] of Object.entries(TOTALS)) {
      const rows = Object.values(BINDUS[p as AvPlanet]);
      expect(rows).toHaveLength(8);
      expect(rows.flat()).toHaveLength(total);
      for (const r of rows) expect(new Set(r).size).toBe(r.length);
    }
  });
  it("gives 337 points to any chart, and never more than 8 from one planet to a sign", async () => {
    for (const [birthDate, birthTime] of [["1999-03-14", "06:30"], ["1975-11-02", "23:10"], ["2008-07-19", "12:00"]]) {
      const av = ashtakavarga(await computeChart({ birthDate, birthTime, lat: 23.02, lng: 72.57, timezone: "Asia/Kolkata" }, "vedic"))!;
      expect(av.sarva.reduce((a, b) => a + b)).toBe(337);
      for (const [p, total] of Object.entries(TOTALS)) {
        expect(av.bhinna[p as AvPlanet].reduce((a, b) => a + b)).toBe(total);
        expect(Math.max(...av.bhinna[p as AvPlanet])).toBeLessThanOrEqual(8);
      }
      expect(describeAshtakavarga(av).match(/^- House/gm)).toHaveLength(12);
    }
  });
  it("counts each point from its own source", () => {
    // Everything in Aries: a sign's points are how many lists hold its number.
    const chart = { tradition: "vedic", ascendant: { sign: "Aries", degree: 1 }, planets: Object.keys(TOTALS).map((name) => ({ name, sign: "Aries", degree: 1, house: 1, retrograde: false })) };
    const av = ashtakavarga(chart as never)!;
    expect(av.bhinna.Sun[0]).toBe(3); // Sun, Mars and Saturn hold a 1
    expect(av.bhinna.Sun[10]).toBe(7); // all but Venus hold an 11
  });
  it("needs a birth time", async () => {
    expect(ashtakavarga(await computeChart({ birthDate: "1999-03-14", birthTime: "12:00", lat: 23, lng: 72, timezone: "Asia/Kolkata", timeKnown: false }, "vedic"))).toBeNull();
  });
});
