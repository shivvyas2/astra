import { describe, it, expect } from "vitest";
import { dignityOf, isCombust, aspectedHouses } from "./derived";
import type { Planet } from "./types";

const p = (over: Partial<Planet>): Planet => ({
  name: "Mars", sign: "Aries", degree: 10, house: 1, retrograde: false, ...over,
});

describe("dignityOf", () => {
  it("reads exaltation and debilitation by sign, not by degree", () => {
    expect(dignityOf("Sun", "Aries", 0).dignity).toBe("exalted");
    expect(dignityOf("Sun", "Aries", 29).dignity).toBe("exalted");
    expect(dignityOf("Sun", "Libra", 15).dignity).toBe("debilitated");
    expect(dignityOf("Saturn", "Libra", 20).dignity).toBe("exalted");
    expect(dignityOf("Saturn", "Aries", 20).dignity).toBe("debilitated");
  });

  it("reports the distance from the deep point", () => {
    expect(dignityOf("Sun", "Aries", 10).fromDeepPoint).toBe(0);
    expect(dignityOf("Sun", "Aries", 13.5).fromDeepPoint).toBeCloseTo(3.5);
    expect(dignityOf("Sun", "Leo", 13.5).fromDeepPoint).toBeUndefined();
    // A moolatrikona placement outside the exaltation sign has no deep point.
    expect(dignityOf("Sun", "Leo", 10).fromDeepPoint).toBeUndefined();
  });

  it("resolves Mercury in Virgo by degree, the one three-way case", () => {
    expect(dignityOf("Mercury", "Virgo", 14).dignity).toBe("exalted");
    expect(dignityOf("Mercury", "Virgo", 18).dignity).toBe("moolatrikona");
    expect(dignityOf("Mercury", "Virgo", 25).dignity).toBe("own");
    // 15.5 falls below the moolatrikona table's `from: 16`, so it is exalted.
    expect(dignityOf("Mercury", "Virgo", 15.5).dignity).toBe("exalted");
  });

  it("resolves the Moon in Taurus, whose exaltation and moolatrikona signs coincide", () => {
    expect(dignityOf("Moon", "Taurus", 2).dignity).toBe("exalted");
    expect(dignityOf("Moon", "Taurus", 2).fromDeepPoint).toBe(1);
    expect(dignityOf("Moon", "Taurus", 10).dignity).toBe("moolatrikona");
    expect(dignityOf("Moon", "Taurus", 10).fromDeepPoint).toBe(7);
    expect(dignityOf("Moon", "Taurus", 29).dignity).toBe("moolatrikona");
    expect(dignityOf("Moon", "Taurus", 29).fromDeepPoint).toBe(26);
    expect(dignityOf("Moon", "Scorpio", 10).dignity).toBe("debilitated");
  });

  it("prefers moolatrikona to own sign", () => {
    expect(dignityOf("Sun", "Leo", 10).dignity).toBe("moolatrikona");
    expect(dignityOf("Sun", "Leo", 25).dignity).toBe("own");
    expect(dignityOf("Saturn", "Aquarius", 10).dignity).toBe("moolatrikona");
    expect(dignityOf("Saturn", "Capricorn", 10).dignity).toBe("own");
  });

  it("gives the nodes no dignity anywhere", () => {
    expect(dignityOf("Rahu", "Taurus", 3).dignity).toBe("neutral");
    expect(dignityOf("Ketu", "Scorpio", 3).dignity).toBe("neutral");
  });

  it("falls back to neutral", () => {
    expect(dignityOf("Jupiter", "Taurus", 12).dignity).toBe("neutral");
  });
});

describe("isCombust", () => {
  const sun = p({ name: "Sun", sign: "Leo", degree: 10 });

  it("uses the shorter arc across the sign boundary", () => {
    // Sun at Leo 10 = 130 deg. Venus at Cancer 5 = 95 deg. 35 deg apart.
    expect(isCombust(p({ name: "Venus", sign: "Cancer", degree: 5 }), sun)).toBe(false);
    // Venus at Leo 4 = 124 deg, 6 deg apart, inside the 10 deg orb.
    expect(isCombust(p({ name: "Venus", sign: "Leo", degree: 4 }), sun)).toBe(true);
  });

  it("uses the tighter retrograde orb for Venus and Mercury", () => {
    // 9 degrees from the Sun: combust direct (orb 10), not retrograde (orb 8).
    const at9 = { sign: "Leo", degree: 19 };
    expect(isCombust(p({ name: "Venus", ...at9 }), sun)).toBe(true);
    expect(isCombust(p({ name: "Venus", ...at9, retrograde: true }), sun)).toBe(false);
    // 13 degrees: Mercury combust direct (orb 14), not retrograde (orb 12).
    const at13 = { sign: "Leo", degree: 23 };
    expect(isCombust(p({ name: "Mercury", ...at13 }), sun)).toBe(true);
    expect(isCombust(p({ name: "Mercury", ...at13, retrograde: true }), sun)).toBe(false);
  });

  it("never combusts the Sun or the nodes", () => {
    expect(isCombust(sun, sun)).toBe(false);
    expect(isCombust(p({ name: "Rahu", sign: "Leo", degree: 11 }), sun)).toBe(false);
    expect(isCombust(p({ name: "Ketu", sign: "Leo", degree: 11 }), sun)).toBe(false);
  });
});

describe("aspectedHouses", () => {
  it("gives every planet the 7th from itself", () => {
    expect(aspectedHouses("Venus", 1)).toEqual([7]);
    expect(aspectedHouses("Sun", 10)).toEqual([4]);
  });

  it("gives Mars the 4th and 8th, Jupiter the 5th and 9th, Saturn the 3rd and 10th", () => {
    expect(aspectedHouses("Mars", 1).sort((a, b) => a - b)).toEqual([4, 7, 8]);
    expect(aspectedHouses("Jupiter", 1).sort((a, b) => a - b)).toEqual([5, 7, 9]);
    expect(aspectedHouses("Saturn", 1).sort((a, b) => a - b)).toEqual([3, 7, 10]);
  });

  it("wraps past the twelfth house", () => {
    expect(aspectedHouses("Saturn", 12).sort((a, b) => a - b)).toEqual([2, 6, 9]);
  });

  it("gives the nodes the 7th only", () => {
    expect(aspectedHouses("Rahu", 3)).toEqual([9]);
    expect(aspectedHouses("Ketu", 3)).toEqual([9]);
  });
});
