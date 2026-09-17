import { describe, it, expect } from "vitest";
import { dignityOf, isCombust, aspectedHouses, deriveFacts } from "./derived";
import type { Chart, Planet } from "./types";

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

const chart: Chart = {
  tradition: "vedic",
  ascendant: { sign: "Scorpio", degree: 14.5 },
  houses: Array.from({ length: 12 }, (_, i) => i * 30),
  planets: [
    // house numbers here are deliberately WRONG (legacy Placidus) so the test
    // proves deriveFacts recomputes them.
    { name: "Sun", sign: "Leo", degree: 10, house: 99, retrograde: false },
    { name: "Moon", sign: "Cancer", degree: 21, house: 99, retrograde: false },
    { name: "Mars", sign: "Capricorn", degree: 28, house: 99, retrograde: false },
    { name: "Mercury", sign: "Leo", degree: 12, house: 99, retrograde: false },
    { name: "Jupiter", sign: "Gemini", degree: 3, house: 99, retrograde: false },
    { name: "Venus", sign: "Taurus", degree: 2, house: 99, retrograde: false },
    { name: "Saturn", sign: "Pisces", degree: 12, house: 99, retrograde: true },
    { name: "Rahu", sign: "Aquarius", degree: 5, house: 99, retrograde: true },
    { name: "Ketu", sign: "Leo", degree: 5, house: 99, retrograde: true },
  ],
  moonSign: "Cancer",
  sunSign: "Leo",
  dasha: {
    mahadasha: "Jupiter", mahadashaStart: "2012-04-01", mahadashaEnd: "2028-04-01",
    antardasha: "Saturn", antardashaStart: "2025-02-01", antardashaEnd: "2027-12-01",
  },
};

describe("deriveFacts", () => {
  const d = deriveFacts(chart);
  const fact = (name: string) => d.planets.find((p) => p.name === name)!;

  it("recomputes houses whole-sign, ignoring the stored numbers", () => {
    // Scorpio lagna: Leo is the 10th sign from Scorpio.
    expect(fact("Sun").house).toBe(10);
    expect(fact("Moon").house).toBe(9);
    expect(fact("Saturn").house).toBe(5);
  });

  it("assigns lordships, and none to the nodes", () => {
    // Scorpio lagna: Mars rules Aries (6th) and Scorpio (1st).
    expect(fact("Mars").rules.sort((a, b) => a - b)).toEqual([1, 6]);
    expect(fact("Rahu").rules).toEqual([]);
    expect(fact("Ketu").rules).toEqual([]);
  });

  it("marks Mars exalted in Capricorn at its deep point", () => {
    expect(fact("Mars").dignity).toBe("exalted");
    expect(fact("Mars").fromDeepPoint).toBe(0);
  });

  it("finds conjunctions and aspects by house", () => {
    expect(fact("Sun").conjunct.sort()).toEqual(["Ketu", "Mercury"]);
    // Sun in house 10 aspects the 4th.
    expect(fact("Sun").aspects).toEqual([4]);
  });

  it("marks Mercury combust, two degrees from the Sun", () => {
    expect(fact("Mercury").combust).toBe(true);
    expect(fact("Mercury").fromSun).toBeCloseTo(2);
    expect(fact("Sun").fromSun).toBeUndefined();
  });

  it("gives every house a lord and says where that lord sits", () => {
    expect(d.houses).toHaveLength(12);
    const seventh = d.houses.find((h) => h.number === 7)!;
    expect(seventh.sign).toBe("Taurus");
    expect(seventh.lord).toBe("Venus");
    expect(seventh.lordHouse).toBe(7); // Venus is itself in Taurus
    expect(seventh.occupants).toEqual(["Venus"]);
  });

  it("carries both dasha lords with their own placements", () => {
    expect(d.dasha.map((x) => x.lord)).toEqual(["Jupiter", "Saturn"]);
    const maha = d.dasha[0];
    expect(maha.level).toBe("mahadasha");
    expect(maha.placement?.house).toBe(8); // Gemini is the 8th from Scorpio
    expect(maha.placement?.rules.sort((a, b) => a - b)).toEqual([2, 5]);
  });

  it("folds in natal conditions computed from the sign, not the chart's stale stored house", () => {
    // C2: detectNatalDoshas must derive each planet's house from its sign
    // (via houseFrom), not read planet.house off the chart it was handed —
    // otherwise one Derived object carries whole-sign `planets` alongside
    // conditions read off Placidus `chart.planets[].house`, two
    // contradictory claims about the same fixed birth fact. This fixture
    // reuses the module's stale-house pattern (every stored house is 99) and
    // additionally moves Mars into Taurus, the 7th sign from the Scorpio
    // ascendant, to trigger Mangal Dosha. If detectNatalDoshas ever reads
    // mars.house (99) again instead of deriving from the sign, this dosha
    // disappears and the assertion fails.
    const afflicted: Chart = {
      ...chart,
      planets: chart.planets.map((p) => (p.name === "Mars" ? { ...p, sign: "Taurus", house: 99 } : p)),
    };
    const afflictedDerived = deriveFacts(afflicted);
    const mangal = afflictedDerived.conditions.find((c) => c.kind === "mangal_dosha");
    expect(mangal).toBeDefined();
    expect(mangal?.detail).toContain("7th house");
    expect(mangal?.signature).toBe("mangal_dosha:7");
  });

  it("returns no dasha facts for a western chart", () => {
    expect(deriveFacts({ ...chart, tradition: "western", dasha: undefined }).dasha).toEqual([]);
  });
});
