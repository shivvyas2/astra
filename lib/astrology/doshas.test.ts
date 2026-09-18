import { describe, it, expect } from "vitest";
import type { Chart, Planet } from "./types";
import { detectNatalDoshas, detectTransitAfflictions, houseFrom, highestSeverity } from "./doshas";

function chartOf(
  ascendant: string,
  planets: Record<string, { sign: string; house?: number; degree?: number; retrograde?: boolean }>,
): Chart {
  const list: Planet[] = Object.entries(planets).map(([name, p]) => ({
    name,
    sign: p.sign,
    degree: p.degree ?? 10,
    house: p.house ?? 1,
    retrograde: p.retrograde ?? false,
  }));
  return {
    tradition: "vedic",
    ascendant: { sign: ascendant, degree: 5 },
    houses: Array.from({ length: 12 }, (_, i) => i * 30),
    planets: list,
    moonSign: planets.Moon?.sign ?? "Aries",
    sunSign: planets.Sun?.sign ?? "Aries",
  };
}

/** A chart with the seven classical planets spread out and no node affliction. */
function neutralNatal(): Chart {
  return chartOf("Aries", {
    Sun: { sign: "Leo", house: 5 },
    Moon: { sign: "Taurus", house: 2 },
    Mercury: { sign: "Virgo", house: 6 },
    Venus: { sign: "Gemini", house: 3 },
    Mars: { sign: "Sagittarius", house: 9 },
    Jupiter: { sign: "Pisces", house: 12 },
    Saturn: { sign: "Aquarius", house: 11 },
    Rahu: { sign: "Cancer", house: 4 },
    Ketu: { sign: "Capricorn", house: 10 },
  });
}

describe("houseFrom", () => {
  it("counts inclusively from the reference sign", () => {
    expect(houseFrom("Aries", "Aries")).toBe(1);
    expect(houseFrom("Aries", "Taurus")).toBe(2);
    expect(houseFrom("Aries", "Pisces")).toBe(12);
    expect(houseFrom("Capricorn", "Aquarius")).toBe(2);
    expect(houseFrom("Pisces", "Aries")).toBe(2);
  });
});

describe("natal doshas", () => {
  it("finds nothing in a clean chart", () => {
    expect(detectNatalDoshas(neutralNatal())).toEqual([]);
  });

  it("flags Mangal dosha for Mars in the 7th, not the 3rd, from the sign — not a stale stored house", () => {
    // C2: detectNatalDoshas must derive the house from the sign
    // (houseFrom(ascendant, sign)), not read planet.house, so it agrees with
    // deriveFacts on a chart stored before the whole-sign change. Each case
    // below sets `.house` to the WRONG whole-sign answer on purpose: if the
    // detector ever reads `.house` again, these would flip.
    const afflicted = neutralNatal();
    const afflictedMars = afflicted.planets.find((p) => p.name === "Mars")!;
    afflictedMars.sign = "Libra"; // 7th from Aries
    afflictedMars.house = 3; // stale/wrong — must be ignored
    expect(detectNatalDoshas(afflicted).map((c) => c.kind)).toContain("mangal_dosha");

    const clear = neutralNatal();
    const clearMars = clear.planets.find((p) => p.name === "Mars")!;
    clearMars.sign = "Gemini"; // 3rd from Aries
    clearMars.house = 7; // stale/wrong — must be ignored
    expect(detectNatalDoshas(clear).map((c) => c.kind)).not.toContain("mangal_dosha");
  });

  it("reports Mangal dosha's ordinal from the whole-sign house, not a stale stored one", () => {
    // Same pattern derived.test.ts already uses for deriveFacts: a chart
    // whose stored planet.house is deliberately wrong. Mars in Libra is the
    // 7th sign from the Aries ascendant; the stored house (99) says
    // something else entirely. The detail string's ordinal must read "7th",
    // derived from the sign — not from the stale 99.
    const afflicted = neutralNatal();
    const mars = afflicted.planets.find((p) => p.name === "Mars")!;
    mars.sign = "Libra";
    mars.house = 99;
    const dosha = detectNatalDoshas(afflicted).find((c) => c.kind === "mangal_dosha");
    expect(dosha?.detail).toContain("7th house");
    expect(dosha?.signature).toBe("mangal_dosha:7");
  });

  it("flags Kaal Sarp when every planet sits inside the nodal axis", () => {
    // Rahu at 0° Aries, Ketu at 0° Libra, everything else in between.
    const hemmed = chartOf("Aries", {
      Rahu: { sign: "Aries", degree: 0, house: 1 },
      Ketu: { sign: "Libra", degree: 0, house: 7 },
      Sun: { sign: "Taurus", degree: 5, house: 2 },
      Moon: { sign: "Gemini", degree: 5, house: 3 },
      Mercury: { sign: "Taurus", degree: 20, house: 2 },
      Venus: { sign: "Cancer", degree: 5, house: 4 },
      Mars: { sign: "Leo", degree: 5, house: 5 },
      Jupiter: { sign: "Virgo", degree: 5, house: 6 },
      Saturn: { sign: "Gemini", degree: 25, house: 3 },
    });
    expect(detectNatalDoshas(hemmed).map((c) => c.kind)).toContain("kaal_sarp");

    // Move one planet past Ketu and the yoga breaks.
    const broken = structuredClone(hemmed);
    broken.planets.find((p) => p.name === "Saturn")!.sign = "Scorpio";
    expect(detectNatalDoshas(broken).map((c) => c.kind)).not.toContain("kaal_sarp");
  });

  it("flags Kemadruma when the Moon has no neighbouring planet", () => {
    const lonely = chartOf("Aries", {
      Sun: { sign: "Taurus", house: 2 },
      Moon: { sign: "Cancer", house: 4 },
      Mercury: { sign: "Taurus", house: 2 },
      Venus: { sign: "Libra", house: 7 },
      Mars: { sign: "Sagittarius", house: 9 },
      Jupiter: { sign: "Pisces", house: 12 },
      Saturn: { sign: "Aquarius", house: 11 },
      Rahu: { sign: "Gemini", house: 3 },
      Ketu: { sign: "Sagittarius", house: 9 },
    });
    expect(detectNatalDoshas(lonely).map((c) => c.kind)).toContain("kemadruma");

    // A planet in the 12th from the Moon cancels it.
    const accompanied = structuredClone(lonely);
    accompanied.planets.find((p) => p.name === "Venus")!.sign = "Gemini";
    expect(detectNatalDoshas(accompanied).map((c) => c.kind)).not.toContain("kemadruma");
  });

  it("flags Grahan dosha when a luminary shares a sign with a node", () => {
    const eclipse = neutralNatal();
    eclipse.planets.find((p) => p.name === "Rahu")!.sign = "Leo"; // with the Sun
    const kinds = detectNatalDoshas(eclipse).map((c) => c.kind);
    expect(kinds).toContain("grahan_sun");
  });

  it("flags Pitru dosha for a node in the 9th, from the sign — not a stale stored house", () => {
    const afflicted = neutralNatal();
    const rahu = afflicted.planets.find((p) => p.name === "Rahu")!;
    rahu.sign = "Sagittarius"; // 9th from Aries
    rahu.house = 99; // stale/wrong — must be ignored
    const dosha = detectNatalDoshas(afflicted).find((c) => c.kind === "pitru_dosha");
    expect(dosha).toBeDefined();
    expect(dosha?.detail).toContain("9th house");
  });
});

describe("transit afflictions", () => {
  const natal = neutralNatal(); // natal Moon in Taurus, Aries ascendant

  function transitWith(planets: Record<string, { sign: string; retrograde?: boolean }>): Chart {
    return chartOf("Aries", {
      Sun: { sign: "Leo" },
      Moon: { sign: "Leo" },
      Mercury: { sign: "Leo" },
      Venus: { sign: "Leo" },
      Mars: { sign: "Leo" },
      Jupiter: { sign: "Leo" },
      Saturn: { sign: "Leo" },
      Rahu: { sign: "Leo" },
      Ketu: { sign: "Aquarius" },
      ...planets,
    });
  }

  it("names the three Sade Sati phases around the natal Moon", () => {
    const rising = detectTransitAfflictions(natal, transitWith({ Saturn: { sign: "Aries" } }));
    expect(rising.find((c) => c.kind === "sade_sati")?.signature).toBe("sade_sati:rising:Aries");

    const peak = detectTransitAfflictions(natal, transitWith({ Saturn: { sign: "Taurus" } }));
    const peakCondition = peak.find((c) => c.kind === "sade_sati");
    expect(peakCondition?.signature).toBe("sade_sati:peak:Taurus");
    expect(peakCondition?.severity).toBe("warning");

    const setting = detectTransitAfflictions(natal, transitWith({ Saturn: { sign: "Gemini" } }));
    expect(setting.find((c) => c.kind === "sade_sati")?.signature).toBe("sade_sati:setting:Gemini");
  });

  it("reports Dhaiya instead of Sade Sati from the 4th and 8th", () => {
    const dhaiya = detectTransitAfflictions(natal, transitWith({ Saturn: { sign: "Leo" } }));
    const kinds = dhaiya.map((c) => c.kind);
    expect(kinds).toContain("shani_dhaiya");
    expect(kinds).not.toContain("sade_sati");
  });

  it("flags a node crossing the natal Moon or the ascendant", () => {
    const overMoon = detectTransitAfflictions(natal, transitWith({ Rahu: { sign: "Taurus" } }));
    expect(overMoon.map((c) => c.kind)).toContain("node_over_moon_rahu");

    const overLagna = detectTransitAfflictions(natal, transitWith({ Ketu: { sign: "Aries" } }));
    expect(overLagna.map((c) => c.kind)).toContain("node_over_lagna_ketu");
  });

  it("ignores a retrograde that is not on a sensitive sign", () => {
    const far = detectTransitAfflictions(natal, transitWith({ Mercury: { sign: "Virgo", retrograde: true } }));
    expect(far.map((c) => c.kind)).not.toContain("retrograde_mercury");

    const onLagna = detectTransitAfflictions(natal, transitWith({ Mercury: { sign: "Aries", retrograde: true } }));
    expect(onLagna.map((c) => c.kind)).toContain("retrograde_mercury");
  });
});

describe("highestSeverity", () => {
  it("returns the worst severity present", () => {
    expect(highestSeverity([{ severity: "info" }, { severity: "warning" }, { severity: "caution" }])).toBe("warning");
    expect(highestSeverity([])).toBe("info");
  });
});
