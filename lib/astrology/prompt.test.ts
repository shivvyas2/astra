import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { buildSystemPrompt, buildChartSystem, buildTodaySystem, buildNumerologySystem, ageOn } from "./prompt";
import { deriveFacts } from "./derived";
import { loShu, numberRelationship } from "./numerology";
import type { Chart } from "./types";

const chart: Chart = {
  tradition: "vedic",
  ascendant: { sign: "Leo", degree: 12.3 },
  houses: Array.from({ length: 12 }, (_, i) => i * 30),
  planets: [
    { name: "Sun", sign: "Sagittarius", degree: 16.5, house: 5, retrograde: false, nakshatra: "Purva Ashadha" },
    { name: "Moon", sign: "Taurus", degree: 3.1, house: 10, retrograde: false, nakshatra: "Krittika" },
    { name: "Venus", sign: "Libra", degree: 10, house: 3, retrograde: false, nakshatra: "Swati" },
  ],
  moonSign: "Taurus",
  sunSign: "Sagittarius",
  ayanamsa: 23.7,
  dasha: {
    mahadasha: "Venus", mahadashaStart: "2015-01-01", mahadashaEnd: "2035-01-01",
    antardasha: "Sun", antardashaStart: "2024-01-01", antardashaEnd: "2025-01-01",
  },
};

// Computed once so every test reads the same facts the prompt is rendered from.
const derived = deriveFacts(chart);

describe("buildSystemPrompt", () => {
  it("embeds the tradition, name, ascendant, planetary data, and dasha", () => {
    const p = buildSystemPrompt({ firstName: "Aditi", tradition: "vedic", chart });
    expect(p).toContain("Aditi");
    expect(p).toContain("Vedic");
    expect(p).toContain("Leo"); // ascendant
    expect(p).toContain("Sagittarius"); // sun sign
    expect(p).toContain("Purva Ashadha"); // nakshatra
    expect(p).toContain("Venus"); // chart planet and mahadasha lord
  });

  it("forbids inventing positions and keeps the guidance disclaimer", () => {
    const p = buildSystemPrompt({ firstName: "Aditi", tradition: "vedic", chart }).toLowerCase();
    expect(p).toContain("never state a placement");
    expect(p).toContain("only this data");
    expect(p).toContain("guidance and reflection");
    expect(p).toContain("in simple words");
  });

  // The chart half carries the cache breakpoint, so anything that changes
  // between turns has to stay out of it or every request is a cache miss.
  it("keeps volatile content out of the cacheable half", () => {
    const stable = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });
    expect(stable).not.toContain("Today is");
    expect(stable).not.toContain("SKY TODAY");
    expect(stable.toLowerCase()).not.toContain("words or fewer");

    const volatile = buildTodaySystem({
      today: "Wednesday, August 26, 2026, morning",
      transits: "Saturn in Pisces",
      maxWords: 160,
    });
    expect(volatile).toContain("Today is");
    expect(volatile).toContain("Saturn in Pisces");
    expect(volatile).toContain("160 words or fewer");
  });

  it("produces the same cacheable half regardless of the day or length rule", () => {
    const a = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });
    const b = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });
    expect(a).toBe(b);
  });

  // Age and the UPCOMING block change over time (a birthday, a sub-period
  // turning over), so they must be addressed to the volatile half only. The
  // stable half is built from the same arguments either way; this pins that
  // handing the full prompt builder age and upcoming leaves its prefix intact.
  it("keeps age and the upcoming block out of the cacheable half", () => {
    const stable = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });
    expect(stable).not.toContain("years old");
    expect(stable).not.toContain("UPCOMING (");

    const plain = buildSystemPrompt({ firstName: "Aditi", tradition: "vedic", chart, derived, today: "Tuesday" });
    const dated = buildSystemPrompt({
      firstName: "Aditi",
      tradition: "vedic",
      chart,
      derived,
      today: "Tuesday",
      age: 34,
      upcoming: "- Jupiter moves into Cancer by 2027-01.",
    });
    expect(plain.startsWith(stable)).toBe(true);
    expect(dated.startsWith(stable)).toBe(true);
    expect(dated).toContain("They are 34 years old.");
    expect(dated).toContain("Jupiter moves into Cancer by 2027-01");
  });
});

describe("the specific-and-personal rules", () => {
  const p = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });

  it("sit in the stable half, after How to answer and before Format", () => {
    const how = p.indexOf("How to answer:");
    const specific = p.indexOf("Be specific and personal:");
    const format = p.indexOf("Format:");
    expect(how).toBeGreaterThan(0);
    expect(specific).toBeGreaterThan(how);
    expect(format).toBeGreaterThan(specific);
  });

  it("address the reader by name about their own life", () => {
    expect(p).toContain('Speak to Aditi about their life, not about "a person with this chart"');
    expect(p).toContain("the LIFE TIMELINE and earlier turns");
  });

  it("require what, when, and exactly one confidence word", () => {
    expect(p).toContain("Every prediction states three things");
    expect(p).toContain("written as months and years");
    expect(p).toContain("using exactly one of: likely, possible, unlikely");
  });

  it("forbid hedging with both outcomes and demand a first-sentence answer to yes/no", () => {
    expect(p).toContain("Pick the outcome the chart favours and say it");
    expect(p).toContain('never "may or may not"');
    expect(p).toContain("A yes/no question gets a yes, a no, or a \"most likely yes/no\" in the first sentence");
  });

  it("reword the old tendencies line so the disclaimer cannot become an escape hatch", () => {
    expect(p).not.toContain("never guaranteed outcomes");
    expect(p).toContain("A prediction is your best reading of the chart said plainly, not a guarantee.");
    expect(p).toContain("never as a way to avoid answering");
    expect(p).toContain("No medical, legal, or financial guarantees.");
  });
});

describe("buildTodaySystem age and upcoming", () => {
  it("puts the age on its own line right after the date", () => {
    const t = buildTodaySystem({ today: "Tuesday", age: 34 });
    const lines = t.split("\n");
    expect(lines[0].startsWith("Today is Tuesday.")).toBe(true);
    expect(lines[1]).toBe("They are 34 years old.");
  });

  it("omits the age line when age is absent, including for zero-safe values", () => {
    expect(buildTodaySystem({ today: "Tuesday" })).not.toContain("years old");
    // Zero is a real age (a newborn's chart), not an absent one.
    expect(buildTodaySystem({ today: "Tuesday", age: 0 })).toContain("They are 0 years old.");
  });

  it("renders the upcoming block with its heading and the instruction to take windows from it", () => {
    const upcoming = "- Current sub-period: Venus–Mercury ends 2027-12 (about 14 months from now).\n- Saturn turns direct by 2026-11.";
    const t = buildTodaySystem({ today: "Tuesday", transits: "- Saturn in Pisces.", upcoming });
    expect(t).toContain("\n\nUPCOMING (dated, from the ephemeris and the dasha table):\n" + upcoming + "\n\nWhen you predict, take the window from here and name its dates.");
    // After SKY TODAY, before the length rule.
    expect(t.indexOf("UPCOMING (")).toBeGreaterThan(t.indexOf("SKY TODAY:"));
    expect(t.indexOf("Length:")).toBeGreaterThan(t.indexOf("name its dates."));
    expect(t).not.toContain("..");
  });

  it("omits the upcoming block when empty", () => {
    expect(buildTodaySystem({ today: "Tuesday", upcoming: "" })).not.toContain("UPCOMING");
    expect(buildTodaySystem({ today: "Tuesday" })).not.toContain("UPCOMING");
  });
});

describe("ageOn", () => {
  const zone = "Asia/Kolkata";
  const at = (iso: string) => DateTime.fromISO(iso, { zone });

  it("counts whole years, turning over on the birthday itself", () => {
    expect(ageOn("1990-07-15", at("2026-07-14T23:00:00"))).toBe(35);
    expect(ageOn("1990-07-15", at("2026-07-15T00:30:00"))).toBe(36);
  });

  it("reads the birthday in the reader's zone, not UTC", () => {
    // 00:30 IST on the 15th is still the 14th in UTC; they have still turned 36 where they live.
    expect(ageOn("1990-07-15", at("2026-07-15T00:30:00"))).toBe(36);
  });

  it("is undefined for an unparseable or future birth date", () => {
    expect(ageOn("not-a-date", at("2026-07-15T12:00:00"))).toBeUndefined();
    expect(ageOn("2030-01-01", at("2026-07-15T12:00:00"))).toBeUndefined();
  });
});

describe("buildTodaySystem transit framing", () => {
  it("puts the instruction on its own line, with no double period, when transits are a multi-line block", () => {
    const transits = "- Saturn in Pisces, house 5 from the ascendant, 11th from the Moon.\n- Jupiter in Gemini, house 10 from the ascendant, 4th from the Moon.";
    const p = buildTodaySystem({ today: "Wednesday, August 26, 2026, morning", transits });

    expect(p).not.toContain("..");
    const lines = p.split("\n");
    const instructionLine = lines.find((l) => l.includes("For anything about now"));
    expect(instructionLine).toBeDefined();
    // The instruction reads as a directive on its own line, not glued onto a bullet.
    expect(instructionLine).not.toMatch(/^- /);
    expect(instructionLine?.trim().startsWith("For anything about now")).toBe(true);
    // Both bullets survive intact, each on their own line.
    expect(p).toContain("- Saturn in Pisces, house 5 from the ascendant, 11th from the Moon.");
    expect(p).toContain("- Jupiter in Gemini, house 10 from the ascendant, 4th from the Moon.");
  });
});

describe("derived facts in the prompt", () => {
  const p = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });

  // Pinned to the fixture's actual computed values, not just the shape of a
  // sentence: an assertion that only checks "some placement, some house
  // number" passes against a corrupted Derived just as happily as a correct
  // one. See the fix report for the broken-output cases these were checked
  // against.
  it("names what each planet rules and how strong it is", () => {
    expect(p).toMatch(/Sun:[^\n]*rules house/);
    expect(p).toMatch(/Moon:[^\n]*exalted/); // Moon at 3.1° Taurus, inside the exaltation band
  });

  it("names the houses each planet aspects, singular for exactly one house", () => {
    // Venus in house 3 aspects only house 9 (the 7th from it) — one house, so
    // "aspects house 9", not the ungrammatical "aspects houses 9".
    expect(p).toMatch(/Venus:[^\n]*aspects house 9/);
    expect(p).not.toMatch(/Venus:[^\n]*aspects houses 9/);
  });

  it("pluralizes only when a planet aspects more than one house", () => {
    // Aries ascendant, Mars in Aries (house 1): Mars aspects the 7th from
    // itself plus its special 4th and 8th — three houses, so "aspects houses".
    const marsChart: Chart = {
      tradition: "vedic",
      ascendant: { sign: "Aries", degree: 1 },
      houses: Array.from({ length: 12 }, (_, i) => i * 30),
      planets: [{ name: "Mars", sign: "Aries", degree: 5, house: 1, retrograde: false }],
      moonSign: "Aries",
      sunSign: "Aries",
    };
    const marsPrompt = buildChartSystem({
      firstName: "Aditi",
      tradition: "vedic",
      chart: marsChart,
      derived: deriveFacts(marsChart),
    });
    expect(marsPrompt).toMatch(/Mars:[^\n]*aspects houses 4, 7, 8/);
  });

  it("gives every house its lord and where that lord sits", () => {
    expect(p).toContain("HOUSES");
    expect(p).toMatch(/House 10: Taurus, lord Venus in house 3 \(Libra/);
  });

  it("says where the dasha lord actually sits", () => {
    expect(p).toMatch(/mahadasha: Venus[^\n]*house 3/);
  });

  it("bans the generic register outright", () => {
    const lower = p.toLowerCase();
    expect(lower).toContain("true of a twelfth of the population");
  });

  it("still forbids inventing placements", () => {
    expect(p.toLowerCase()).toContain("never state a placement");
  });

  // A house lord who isn't one of the chart's own bodies gets a sentinel
  // (house 0, empty sign) from deriveFacts. The renderer must say plainly
  // that the lord isn't a body here rather than printing "house 0" as if it
  // were a real placement.
  it("never states a placement for a lord that is not a body in the chart", () => {
    const gap: Chart = {
      ...chart,
      ascendant: { sign: "Aries", degree: 1 },
      planets: [{ name: "Moon", sign: "Cancer", degree: 5, house: 4, retrograde: false }],
      dasha: undefined,
    };
    const gapDerived = deriveFacts(gap);
    const gapPrompt = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart: gap, derived: gapDerived });
    expect(gapPrompt).toMatch(/lord Sun \(not a body in this chart\)/);
    expect(gapPrompt).not.toMatch(/lord Sun in house 0/);
  });
});

// C1: Western readings must not get Vedic technique or Vedic doshas. This is
// the test that would have caught it — it fails against the pre-fix
// buildChartSystem, which required `derived` and rendered it (moolatrikona,
// graha drishti, doshas, whole-sign houses) for every tradition.
describe("a Western chart gets no derived facts, no Vedic technique, and Placidus houses", () => {
  // Leo ascendant; Mars stored in Placidus house 5 (mid-chart house), while
  // whole-sign counting from Leo would put Capricorn — Mars's sign — in
  // house 6. If the prompt ever fell back to whole-sign counting for
  // Western, this planet's rendered house would silently become 6.
  const westernChart: Chart = {
    tradition: "western",
    ascendant: { sign: "Leo", degree: 12.3 },
    houses: Array.from({ length: 12 }, (_, i) => i * 30),
    planets: [
      { name: "Sun", sign: "Sagittarius", degree: 16.5, house: 4, retrograde: false },
      { name: "Mars", sign: "Capricorn", degree: 2, house: 5, retrograde: false },
    ],
    moonSign: "Taurus",
    sunSign: "Sagittarius",
  };

  it("has no derived block attached, the way computeChart produces it", () => {
    expect(westernChart.derived).toBeUndefined();
  });

  it("buildChartSystem, called with no derived, renders plain Placidus houses and no Vedic technique", () => {
    const p = buildChartSystem({ firstName: "Aditi", tradition: "western", chart: westernChart });

    // No Vedic dignity, aspect, or dosha technique anywhere in the prompt.
    expect(p.toLowerCase()).not.toContain("moolatrikona");
    expect(p).not.toMatch(/aspects house/);
    expect(p).not.toContain("STANDING CONDITIONS");

    // Planet houses come from chart.planets[].house (Placidus), not
    // whole-sign counting from the ascendant.
    expect(p).toContain("Mars: Capricorn 2°, h5");
    expect(p).not.toContain("Mars: Capricorn 2°, h6");
  });

  it("buildSystemPrompt's default (no derived passed) does the same, end to end", () => {
    const p = buildSystemPrompt({ firstName: "Aditi", tradition: "western", chart: westernChart });
    expect(p.toLowerCase()).not.toContain("moolatrikona");
    expect(p).not.toMatch(/aspects house/);
    expect(p).not.toContain("STANDING CONDITIONS");
    expect(p).toContain("Mars: Capricorn 2°, h5");
  });
});

describe("numerology stays its own block, not folded into whatever section renders last", () => {
  it("puts a blank line before the numerology sentence", () => {
    const p = buildChartSystem({
      firstName: "Aditi",
      tradition: "vedic",
      chart,
      derived,
      numerology: { mulank: 3, bhagyank: 7 },
    });
    const lines = p.split("\n");
    const numIndex = lines.findIndex((l) => l.startsWith("Numerology:"));
    expect(numIndex).toBeGreaterThan(0);
    expect(lines[numIndex - 1]).toBe("");
    // And it must not read as one more item glued onto the block above it.
    expect(p).not.toMatch(/[A-Za-z].*\n(Numerology:)/);
    expect(p).toContain("Numerology: Mulank 3, Bhagyank 7.");
  });
});

describe("derived facts survive a JSON round trip", () => {
  it("renders identically whether derived is freshly computed or has been through JSON (as a stored chart returns it)", () => {
    const fresh = deriveFacts(chart);
    const roundTripped = JSON.parse(JSON.stringify(deriveFacts(chart)));
    const a = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived: fresh });
    const b = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived: roundTripped });
    expect(a).toBe(b);
  });
});

describe("numerology prompt", () => {
  // 1990-07-15 -> digits 1,9,9,0,0,7,1,5: 1 and 9 repeat twice each; 2,3,4,6,8
  // never appear. numberRelationship(1, 6) is Sun vs Venus, which ENEMIES
  // lists explicitly, so this fixture exercises a real (non-default) branch.
  const p = buildNumerologySystem({
    firstName: "Aditi",
    fullName: "Aditi Sharma",
    mulank: 6,
    bhagyank: 3,
    namank: 1,
    grid: loShu("1990-07-15"),
    namankToMulank: numberRelationship(1, 6),
  });

  it("names which digits repeat and which are missing, with the exact digits", () => {
    // Anchored to the literal line: wrong digits, a swapped repeated/missing
    // pair, or a dropped line would all fail this.
    expect(p).toContain("Repeated digits in the birth date: 1, 9.");
    expect(p).toContain("Missing digits: 2, 3, 4, 6, 8.");
  });

  it("says how the name number sits with the root number, naming both numbers and the relationship", () => {
    // Anchored to the full literal sentence, not just "friend|neutral|enemy"
    // anywhere in the text: catches a swapped namank/mulank argument order or
    // a wrong relationship word.
    expect(p).toContain("The namank 1 and the mulank 6 are enemies.");
  });

  it("keeps the exact-numbers rule", () => {
    expect(p.toLowerCase()).toContain("never invent or alter one");
  });
});

describe("buildTodaySystem with personal cycles", () => {
  it("carries the personal year and month, each with its own value", () => {
    // Distinct year/month values so a swap between the two fields, or either
    // one rendering the wrong number, fails this.
    const t = buildTodaySystem({ today: "Tuesday", personal: { year: 5, month: 7 } });
    expect(t).toContain("personal year 5");
    expect(t).toContain("personal month 7");
    expect(t).toMatch(/personal year 5 and personal month 7/);
  });

  it("omits them when absent", () => {
    expect(buildTodaySystem({ today: "Tuesday" })).not.toContain("personal year");
  });
});
