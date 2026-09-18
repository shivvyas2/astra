import { describe, it, expect } from "vitest";
import { describeGochara } from "./transits";
import type { Chart } from "./types";

const natal: Chart = {
  tradition: "vedic",
  ascendant: { sign: "Scorpio", degree: 14.5 },
  houses: Array.from({ length: 12 }, (_, i) => i * 30),
  planets: [
    { name: "Sun", sign: "Leo", degree: 10, house: 10, retrograde: false },
    { name: "Moon", sign: "Cancer", degree: 21, house: 9, retrograde: false },
    { name: "Saturn", sign: "Pisces", degree: 12, house: 5, retrograde: true },
  ],
  moonSign: "Cancer",
  sunSign: "Leo",
};

const transit: Chart = {
  ...natal,
  planets: [
    { name: "Saturn", sign: "Pisces", degree: 20, house: 1, retrograde: false },
    { name: "Jupiter", sign: "Cancer", degree: 2, house: 1, retrograde: false },
  ],
};

describe("describeGochara", () => {
  const text = describeGochara(natal, transit);

  it("gives each transiting planet its house from the lagna", () => {
    // Scorpio lagna: Pisces is the 5th sign from Scorpio.
    expect(text).toContain("Saturn in Pisces");
    expect(text).toMatch(/Saturn[^\n]*house 5 from the ascendant/);
  });

  it("gives each transiting planet its house from the natal Moon", () => {
    // Cancer Moon: Pisces is the 9th from Cancer; Cancer is the 1st.
    expect(text).toMatch(/Saturn[^\n]*9th from the Moon/);
    expect(text).toMatch(/Jupiter[^\n]*1st from the Moon/);
  });

  it("names the natal planet a transiting planet sits on", () => {
    expect(text).toMatch(/Saturn[^\n]*natal Saturn/);
    expect(text).toMatch(/Jupiter[^\n]*natal Moon/);
  });

  it("says nothing about a planet that is not transiting anything of note", () => {
    expect(text).not.toContain("undefined");
  });
});

describe("describeGochara affliction inclusion", () => {
  // Natal Moon in Cancer, transiting Saturn also in Cancer: houseFrom(Cancer,
  // Cancer) is the 1st, which detectTransitAfflictions reads as the peak phase
  // of Sade Sati — a real, non-vacuous affliction to assert against.
  const transitWithAffliction: Chart = {
    ...natal,
    planets: [{ name: "Saturn", sign: "Cancer", degree: 5, house: 1, retrograde: false }],
  };

  it("includes affliction lines by default", () => {
    const text = describeGochara(natal, transitWithAffliction);
    expect(text).toContain("Sade Sati");
  });

  it("omits affliction lines when includeAfflictions is false", () => {
    const text = describeGochara(natal, transitWithAffliction, { includeAfflictions: false });
    expect(text).not.toContain("Sade Sati");
    // Still the plain planet-in-sign line — only the affliction block is gone.
    expect(text).toContain("Saturn in Cancer");
  });
});
