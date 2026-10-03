import { describe, it, expect } from "vitest";
import { describeGochara, describeUpcomingTransits } from "./transits";
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

describe("describeGochara for a western chart", () => {
  // Gochara — houses from the lagna and from the Moon, and the afflictions they
  // raise — is Vedic. A tropical chart must not be handed any of it: the house
  // numbers would be whole-sign where Western is Placidus, and Sade Sati means
  // nothing in that tradition.
  const western: Chart = { ...natal, tradition: "western" };
  // Saturn transits Cancer, the sign the natal Moon occupies — in a Vedic chart
  // that is Sade Sati's peak phase, so this fixture would name it if the guard
  // were missing.
  const overTheMoon: Chart = {
    ...western,
    planets: [{ name: "Saturn", sign: "Cancer", degree: 3, house: 1, retrograde: false }],
  };

  const text = describeGochara(western, overTheMoon);

  it("still says where each transiting body is", () => {
    expect(text).toContain("Saturn in Cancer");
  });

  it("still names the natal body it sits on", () => {
    expect(text).toContain("over natal Moon");
  });

  it("counts no house from the ascendant", () => {
    expect(text).not.toMatch(/from the ascendant/);
  });

  it("counts no house from the Moon", () => {
    expect(text).not.toMatch(/from the Moon/);
  });

  it("names no Vedic affliction", () => {
    expect(text).not.toContain("Sade Sati");
  });

  it("still gives a Vedic chart the full gochara reading", () => {
    const vedicText = describeGochara(natal, { ...natal, planets: overTheMoon.planets });
    expect(vedicText).toMatch(/house 9 from the ascendant/);
    expect(vedicText).toMatch(/1st from the Moon/);
    expect(vedicText).toContain("Sade Sati");
  });
});

describe("describeUpcomingTransits", () => {
  // The natal chart above: Scorpio lagna, Moon in Cancer, Sun in Leo, Saturn
  // in Pisces. A sky with every slow body placed, then samples that move
  // them one at a time so each line can be pinned to a date.
  const sky = (planets: Chart["planets"]): Chart => ({ ...natal, planets });
  const p = (name: string, sign: string, retrograde = false) => ({ name, sign, degree: 10, house: 1, retrograde });

  const today = sky([
    p("Saturn", "Pisces"),
    p("Jupiter", "Gemini"),
    p("Rahu", "Aquarius", true),
    p("Ketu", "Leo", true),
    p("Mars", "Virgo"),
  ]);

  // Given out of order on purpose: the function must sort by day itself.
  const samples = [
    {
      day: "2027-01-02",
      chart: sky([p("Saturn", "Aries"), p("Jupiter", "Cancer"), p("Rahu", "Capricorn", true), p("Ketu", "Cancer", true), p("Mars", "Aquarius")]),
    },
    {
      day: "2026-11-01",
      chart: sky([p("Saturn", "Pisces", true), p("Jupiter", "Gemini"), p("Rahu", "Aquarius", true), p("Ketu", "Leo", true), p("Mars", "Libra")]),
    },
    {
      day: "2026-12-31",
      chart: sky([p("Saturn", "Pisces", true), p("Jupiter", "Cancer"), p("Rahu", "Aquarius", true), p("Ketu", "Leo", true), p("Mars", "Scorpio")]),
    },
    {
      day: "2027-04-02",
      chart: sky([p("Saturn", "Aries"), p("Jupiter", "Cancer", true), p("Rahu", "Capricorn", true), p("Ketu", "Cancer", true), p("Mars", "Aries")]),
    },
  ];

  const text = describeUpcomingTransits(natal, today, samples);

  it("dates each slow body's first sign change to the earliest sample that shows it", () => {
    // Mars reaches Libra by the 30-day sample, not Scorpio or Aquarius later.
    expect(text).toContain("- Mars moves into Libra by 2026-11");
    // Jupiter's Cancer ingress shows first in the 2026-12-31 sample, even
    // though the 2027-01-02 sample was listed before it.
    expect(text).toContain("- Jupiter moves into Cancer by 2026-12");
    expect(text).toContain("- Saturn moves into Aries by 2027-01");
    expect(text).toContain("- Rahu moves into Capricorn by 2027-01");
    expect(text).toContain("- Ketu moves into Cancer by 2027-01");
  });

  it("counts the new sign from the ascendant and the Moon for a Vedic chart, and names the natal body it lands on", () => {
    // Scorpio lagna: Cancer is the 9th sign; Cancer Moon: Cancer is the 1st.
    expect(text).toContain("- Jupiter moves into Cancer by 2026-12 (house 9 from your ascendant, 1st from your Moon, over natal Moon).");
    // Aries: 6th from Scorpio, 10th from Cancer; nothing natal there.
    expect(text).toContain("- Saturn moves into Aries by 2027-01 (house 6 from your ascendant, 10th from your Moon).");
  });

  it("dates stations for Saturn, Jupiter, and Mars only", () => {
    expect(text).toContain("- Saturn turns retrograde by 2026-11.");
    expect(text).toContain("- Jupiter turns retrograde by 2027-04.");
    expect(text).not.toMatch(/Mars turns/);
    expect(text).not.toMatch(/Rahu turns|Ketu turns/);
  });

  it("puts the ingresses before the stations, one line each", () => {
    const lines = text.split("\n");
    const firstStation = lines.findIndex((l) => / turns /.test(l));
    const lastIngress = lines.map((l) => / moves into /.test(l)).lastIndexOf(true);
    expect(lastIngress).toBeLessThan(firstStation);
    expect(lines.every((l) => l.startsWith("- ") && l.endsWith("."))).toBe(true);
    expect(text).not.toContain("undefined");
  });

  it("turns direct when a body stops being retrograde", () => {
    const retro = sky([p("Saturn", "Pisces", true)]);
    const later = [{ day: "2026-11-01", chart: sky([p("Saturn", "Pisces", false)]) }];
    expect(describeUpcomingTransits(natal, retro, later)).toBe("- Saturn turns direct by 2026-11.");
  });

  it("is empty when nothing changes, or when a body is missing from the samples", () => {
    expect(describeUpcomingTransits(natal, today, [{ day: "2026-11-01", chart: today }])).toBe("");
    expect(describeUpcomingTransits(natal, today, [])).toBe("");
    // A sample without Saturn cannot report a Saturn change.
    const noSaturn = [{ day: "2026-11-01", chart: sky([p("Jupiter", "Gemini")]) }];
    expect(describeUpcomingTransits(natal, today, noSaturn)).toBe("");
  });

  it("gives a Western chart the sign and the natal body only, with no house counts", () => {
    const western = { ...natal, tradition: "western" as const };
    const w = describeUpcomingTransits(western, today, samples);
    expect(w).toContain("- Jupiter moves into Cancer by 2026-12 (over natal Moon).");
    expect(w).toContain("- Saturn moves into Aries by 2027-01.");
    expect(w).not.toMatch(/from your ascendant/);
    expect(w).not.toMatch(/from your Moon/);
    expect(w).toContain("- Saturn turns retrograde by 2026-11.");
  });
});
