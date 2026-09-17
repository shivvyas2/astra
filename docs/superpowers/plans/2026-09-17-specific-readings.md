# Specific Readings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the model house lords, aspects, dignity, dasha-lord placement, gochara and the already-computed doshas, so readings cite real chart facts instead of sign-level generalities.

**Architecture:** One pure module, `lib/astrology/derived.ts`, turns a `Chart` into a `Derived` fact set using fixed classical tables. `computeChart` stores it as `chart.derived`; every reader falls back to computing it in process, so existing users need no migration. The web prompt, the iOS on-device table and numerology all render from that one source. Vedic house numbers move to whole-sign first, because lordship is undefined without it.

**Tech Stack:** TypeScript, Next.js App Router, vitest, swisseph-wasm, Supabase; Swift 6 / SwiftUI / XCTest for the iOS target; Apple FoundationModels (iOS 26+) on device.

**Spec:** `docs/superpowers/specs/2026-09-17-specific-readings-design.md`

## Global Constraints

- **Depth is core Parashari only.** No divisional charts (D9, D10), no Shadbala, no Ashtakavarga, no yoga detection beyond the seventeen detectors already in `lib/astrology/doshas.ts`.
- **Contested rules stay out.** Rahu and Ketu rule no signs (`rules: []`). The nodes aspect the 7th house only. `Dignity` has exactly five values — `exalted | debilitated | moolatrikona | own | neutral` — and never uses planetary friendship.
- **No SQL migration.** Nothing in this plan adds, alters or backfills a table. The outstanding 0006/0007 migrations stay untouched.
- **Prompt cache discipline.** Chart-derived text goes in `buildChartSystem` (byte-stable per user). Anything varying with the date goes in `buildTodaySystem`. Never put a value that changes per request into either. See `docs/MODEL_COSTS.md`.
- **On-device vocabulary is neutral.** Apple's on-device model refuses text it reads as fortune telling. In Swift, houses are "sections", lords are "controlled by", aspects are "linked to", dignity is a "strength rating". Never the astrological word. This was found by testing against the real model, not reasoned out.
- **Doshas never go on device.** Conditions are interpretive; the reasoner only restates records.
- Run TypeScript tests with `npm test` (`vitest run`). Commit after every task.

---

## File Structure

**Created**
- `lib/astrology/derived.ts` — classical tables and `deriveFacts`. Pure, no I/O.
- `lib/astrology/derived.test.ts`
- `lib/astrology/transits.test.ts`
- `mobile/Sanchara/Tests/ChartFactsTests.swift`

**Modified**
- `lib/astrology/constants.ts` — gains `signIndex` and `houseFrom`, the shared sign arithmetic.
- `lib/astrology/doshas.ts` — imports that arithmetic instead of duplicating it; keeps re-exporting `houseFrom`.
- `lib/astrology/chart.ts` — whole-sign houses for Vedic; stamps `schemaVersion`; stores `derived`.
- `lib/astrology/types.ts` — `Chart` gains `derived` and `schemaVersion`.
- `lib/astrology/transits.ts` — `describeGochara` replaces `describeTransits`.
- `lib/astrology/prompt.ts` — renders the derived blocks; tighter output rules.
- `lib/astrology/numerology.ts` — personal year/month, Lo Shu grid, number relationships.
- `lib/data/birthProfile.ts` — `ensureCurrentChart`, the lazy upgrade.
- `lib/alerts/run.ts` — natal conditions reconcile silently after the first read.
- `app/api/chat/route.ts` — resolves derived facts and passes them through.
- `mobile/Sanchara/Sources/Features/Kundli/ChartData.swift` — optional `DerivedFacts`.
- `mobile/Sanchara/Sources/Features/Chat/ChartFacts.swift` — richer neutral rows.
- `mobile/Sanchara/Sources/Features/Chat/OnDeviceReasoner.swift` — new trigger words.

**Deliberately untouched:** `lib/pdf/kundli.ts`, `KundliView.swift`, all three widgets, `ChartCache`, `OnDeviceSuggestions.swift`, `SancharaIntents.swift`. They read house numbers from the stored chart and become correct without edits.

---

## Phase 1 — Server truth

### Task 1: Shared sign arithmetic

**Files:**
- Modify: `lib/astrology/constants.ts`
- Modify: `lib/astrology/doshas.ts:33-48`
- Test: `lib/astrology/doshas.test.ts` (existing `houseFrom` tests must keep passing)

**Interfaces:**
- Consumes: nothing.
- Produces: `signIndex(sign: string): number` and `houseFrom(from: string, sign: string): number`, both exported from `lib/astrology/constants.ts`. `houseFrom` stays exported from `lib/astrology/doshas.ts` too.

Why first: `chart.ts` needs whole-sign arithmetic, `doshas.ts` already has it, and `chart.ts` importing from `doshas.ts` would point the dependency backwards.

- [ ] **Step 1: Move the two functions into constants.ts**

Append to `lib/astrology/constants.ts`:

```ts
/** -1 when the name is not one of the twelve. */
export function signIndex(sign: string): number {
  return SIGNS.indexOf(sign as (typeof SIGNS)[number]);
}

/**
 * The 1-indexed house of `sign` counted from `from` — the classical "Nth from".
 * Returns 0 when either name is unknown, so a caller can tell it apart from a
 * real house number.
 */
export function houseFrom(from: string, sign: string): number {
  const a = signIndex(from);
  const b = signIndex(sign);
  if (a < 0 || b < 0) return 0;
  return ((b - a + 12) % 12) + 1;
}
```

- [ ] **Step 2: Point doshas.ts at them**

In `lib/astrology/doshas.ts`, change the import line to:

```ts
import { SIGNS, signIndex, houseFrom } from "./constants";
```

Delete the local `signIndex` (line 33-35) and the local `houseFrom` (line 43-48), and re-export so existing importers and tests keep working:

```ts
export { houseFrom };
```

- [ ] **Step 3: Run the existing suite**

Run: `npm test -- lib/astrology/doshas.test.ts`
Expected: PASS — all `houseFrom` and dosha tests unchanged.

- [ ] **Step 4: Commit**

```bash
git add lib/astrology/constants.ts lib/astrology/doshas.ts
git commit -m "refactor(astrology): move sign arithmetic into constants"
```

---

### Task 2: Whole-sign houses for Vedic

**Files:**
- Modify: `lib/astrology/types.ts`
- Modify: `lib/astrology/chart.ts:32-45` and `:78-103`
- Test: `lib/astrology/chart.test.ts`

**Interfaces:**
- Consumes: `signIndex`, `houseFrom` from Task 1.
- Produces: `CHART_SCHEMA_VERSION: number` exported from `lib/astrology/chart.ts` (value `2`). `Chart` gains `schemaVersion?: number`. Vedic `Planet.house` is now whole-sign from the lagna.

- [ ] **Step 1: Write the failing test**

Append to `lib/astrology/chart.test.ts`:

```ts
import { computeChart, CHART_SCHEMA_VERSION } from "./chart";
import { houseFrom } from "./constants";

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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/astrology/chart.test.ts`
Expected: FAIL — `CHART_SCHEMA_VERSION` is not exported, and Vedic houses do not match whole-sign counting.

- [ ] **Step 3: Add the field to the type**

In `lib/astrology/types.ts`, add to `Chart`:

```ts
  /** Bumped when the computation changes in a way that moves stored values. */
  schemaVersion?: number;
```

- [ ] **Step 4: Implement whole-sign houses**

In `lib/astrology/chart.ts`, add the import and the constant:

```ts
import { degreeInSign, nakshatraOf, signOf, signIndex, houseFrom, SIGNS } from "./constants";

/**
 * Version 2 moved Vedic charts from Placidus to whole-sign houses. A stored
 * chart below this version has house numbers that disagree with the rashi
 * labels every renderer draws, so readers upgrade it before use.
 */
export const CHART_SCHEMA_VERSION = 2;
```

Compute the ascendant sign once, before the planet loop:

```ts
  const ascSign = signOf(ascLon);
```

Replace the `house:` line inside the `BODIES` loop:

```ts
      house: tradition === "vedic" ? houseFrom(ascSign, signOf(lon)) : houseOf(lon, cusps),
```

Replace the same line in the Ketu block:

```ts
    house: tradition === "vedic" ? houseFrom(ascSign, signOf(ketuLon)) : houseOf(ketuLon, cusps),
```

Add to the returned object:

```ts
    schemaVersion: CHART_SCHEMA_VERSION,
```

Leave `houseOf` in place — Western still uses it.

- [ ] **Step 5: Run the tests**

Run: `npm test -- lib/astrology/chart.test.ts`
Expected: PASS, including the pre-existing `houses` and ayanamsa tests.

- [ ] **Step 6: Run the whole suite, because dosha detection reads planet.house**

Run: `npm test`
Expected: PASS. If a dosha test fails, it is asserting a Placidus house number for a fixture chart — update the expectation to the whole-sign number and note it in the commit body. Do not change detection logic.

- [ ] **Step 7: Commit**

```bash
git add lib/astrology/types.ts lib/astrology/chart.ts lib/astrology/chart.test.ts
git commit -m "fix(astrology): vedic houses are whole-sign, not placidus

The kundli, the PDF and the on-device table all label houses whole-sign
from the lagna and then fill them with Placidus numbers, so a planet could
be drawn in a house marked with a sign it was not in. Placidus also allows
two houses on one sign, which leaves lordship undefined."
```

---

### Task 3: Classical tables and per-planet facts

**Files:**
- Create: `lib/astrology/derived.ts`
- Test: `lib/astrology/derived.test.ts`

**Interfaces:**
- Consumes: `signIndex`, `houseFrom` (Task 1).
- Produces: types `Dignity`, `PlanetFact`, `HouseFact`, `DashaFact`, `Derived`; and `dignityOf(name, sign, degree)`, `isCombust(planet, sun)`, `aspectedHouses(name, house)`, all exported from `lib/astrology/derived.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/astrology/derived.test.ts`:

```ts
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
  });

  it("resolves Mercury in Virgo by degree, the one three-way case", () => {
    expect(dignityOf("Mercury", "Virgo", 14).dignity).toBe("exalted");
    expect(dignityOf("Mercury", "Virgo", 18).dignity).toBe("moolatrikona");
    expect(dignityOf("Mercury", "Virgo", 25).dignity).toBe("own");
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/astrology/derived.test.ts`
Expected: FAIL — `Cannot find module './derived'`.

- [ ] **Step 3: Write the module**

Create `lib/astrology/derived.ts`:

```ts
import { signIndex, houseFrom } from "./constants";
import { detectNatalDoshas, type Condition } from "./doshas";
import type { Chart, Planet } from "./types";

/**
 * The chart, read with the techniques that make an answer specific.
 *
 * Everything here is a fixed classical table applied to positions the ephemeris
 * already produced. There is no I/O and no interpretation: the output is the
 * grounding a reading is written from, not the reading.
 *
 * Three rules are deliberately absent because the tradition does not agree on
 * them, and a contested claim repeated in every reading is worse than a missing
 * one: Rahu and Ketu rule no signs, the nodes aspect only the 7th, and dignity
 * never consults planetary friendship. Friendship is a compound judgement —
 * natural plus temporal — and half of it is misleading rather than partial.
 */

export type Dignity = "exalted" | "debilitated" | "moolatrikona" | "own" | "neutral";

export type PlanetFact = {
  name: string;
  sign: string;
  degree: number;
  house: number;
  nakshatra?: string;
  retrograde: boolean;
  /** Houses this planet owns. Empty for Rahu and Ketu. */
  rules: number[];
  dignity: Dignity;
  /** Degrees from exact exaltation or debilitation, when in that sign. */
  fromDeepPoint?: number;
  combust: boolean;
  /** Degrees from the Sun, shorter arc. Absent for the Sun itself. */
  fromSun?: number;
  aspects: number[];
  aspectsPlanets: string[];
  conjunct: string[];
};

export type HouseFact = {
  number: number;
  sign: string;
  lord: string;
  lordHouse: number;
  lordSign: string;
  lordDignity: Dignity;
  occupants: string[];
  aspectedBy: string[];
};

export type DashaFact = {
  level: "mahadasha" | "antardasha";
  lord: string;
  start: string;
  end: string;
  /** The lord's own natal placement. Absent when the lord is not in the chart. */
  placement?: PlanetFact;
};

export type Derived = {
  planets: PlanetFact[];
  houses: HouseFact[];
  dasha: DashaFact[];
  conditions: Condition[];
};

const SIGN_LORD: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

/** The nodes own nothing and are dignified nowhere. */
const NODES = new Set(["Rahu", "Ketu"]);

const EXALTATION: Record<string, { sign: string; degree: number }> = {
  Sun: { sign: "Aries", degree: 10 },
  Moon: { sign: "Taurus", degree: 3 },
  Mars: { sign: "Capricorn", degree: 28 },
  Mercury: { sign: "Virgo", degree: 15 },
  Jupiter: { sign: "Cancer", degree: 5 },
  Venus: { sign: "Pisces", degree: 27 },
  Saturn: { sign: "Libra", degree: 20 },
};

const MOOLATRIKONA: Record<string, { sign: string; from: number; to: number }> = {
  Sun: { sign: "Leo", from: 0, to: 20 },
  Moon: { sign: "Taurus", from: 4, to: 30 },
  Mars: { sign: "Aries", from: 0, to: 12 },
  Mercury: { sign: "Virgo", from: 16, to: 20 },
  Jupiter: { sign: "Sagittarius", from: 0, to: 10 },
  Venus: { sign: "Libra", from: 0, to: 15 },
  Saturn: { sign: "Aquarius", from: 0, to: 20 },
};

/** Orb in degrees from the Sun. Retrograde orbs are tighter for two planets. */
const COMBUSTION: Record<string, { direct: number; retro: number }> = {
  Moon: { direct: 12, retro: 12 },
  Mars: { direct: 17, retro: 17 },
  Mercury: { direct: 14, retro: 12 },
  Jupiter: { direct: 11, retro: 11 },
  Venus: { direct: 10, retro: 8 },
  Saturn: { direct: 15, retro: 15 },
};

/** Extra drishti beyond the 7th, which every planet has. */
const SPECIAL_ASPECTS: Record<string, number[]> = {
  Mars: [4, 8],
  Jupiter: [5, 9],
  Saturn: [3, 10],
};

function oppositeSign(sign: string): string {
  const i = signIndex(sign);
  if (i < 0) return sign;
  return Object.keys(SIGN_LORD)[(i + 6) % 12];
}

/** Absolute ecliptic longitude, rebuilt from sign plus degree-in-sign. */
function longitudeOf(planet: Pick<Planet, "sign" | "degree">): number {
  return signIndex(planet.sign) * 30 + planet.degree;
}

export function signsRuledBy(name: string): string[] {
  if (NODES.has(name)) return [];
  return Object.entries(SIGN_LORD)
    .filter(([, lord]) => lord === name)
    .map(([sign]) => sign);
}

export function dignityOf(
  name: string,
  sign: string,
  degree: number,
): { dignity: Dignity; fromDeepPoint?: number } {
  if (NODES.has(name)) return { dignity: "neutral" };

  const ex = EXALTATION[name];
  const deb = ex ? oppositeSign(ex.sign) : undefined;
  const fromDeepPoint =
    ex && (sign === ex.sign || sign === deb) ? Math.abs(degree - ex.degree) : undefined;

  // Mercury in Virgo is exalted, moolatrikona and own all at once. The
  // tradition splits it by degree, so it is written out rather than left to
  // fall through the precedence order below.
  if (name === "Mercury" && sign === "Virgo") {
    if (degree <= 15) return { dignity: "exalted", fromDeepPoint };
    if (degree <= 20) return { dignity: "moolatrikona" };
    return { dignity: "own" };
  }

  if (ex && sign === ex.sign) return { dignity: "exalted", fromDeepPoint };

  const mt = MOOLATRIKONA[name];
  if (mt && sign === mt.sign && degree >= mt.from && degree < mt.to) {
    return { dignity: "moolatrikona" };
  }

  if (signsRuledBy(name).includes(sign)) return { dignity: "own" };
  if (deb && sign === deb) return { dignity: "debilitated", fromDeepPoint };
  return { dignity: "neutral" };
}

/** Shorter arc between two longitudes, 0 to 180. */
export function arcFromSun(planet: Pick<Planet, "sign" | "degree">, sun: Pick<Planet, "sign" | "degree">): number {
  const diff = Math.abs(longitudeOf(planet) - longitudeOf(sun)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function isCombust(planet: Planet, sun: Planet): boolean {
  const orb = COMBUSTION[planet.name];
  if (!orb) return false; // the Sun itself, and the nodes
  return arcFromSun(planet, sun) <= (planet.retrograde ? orb.retro : orb.direct);
}

/** Houses this planet aspects, given the house it sits in. */
export function aspectedHouses(name: string, house: number): number[] {
  const offsets = [7, ...(NODES.has(name) ? [] : SPECIAL_ASPECTS[name] ?? [])];
  return offsets.map((n) => ((house - 1 + n - 1) % 12) + 1);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/astrology/derived.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/astrology/derived.ts lib/astrology/derived.test.ts
git commit -m "feat(astrology): classical tables for dignity, combustion and drishti"
```

---

### Task 4: `deriveFacts`

**Files:**
- Modify: `lib/astrology/derived.ts`
- Test: `lib/astrology/derived.test.ts`

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: `deriveFacts(chart: Chart): Derived`.

Note for the implementer: `deriveFacts` recomputes each planet's house whole-sign from the ascendant sign rather than trusting `chart.planets[].house`. That is what makes it correct on a chart stored before Task 2, which is the whole reason no backfill script is needed.

- [ ] **Step 1: Write the failing test**

Append to `lib/astrology/derived.test.ts`:

```ts
import { deriveFacts } from "./derived";
import type { Chart } from "./types";

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

  it("folds in the natal conditions", () => {
    expect(Array.isArray(d.conditions)).toBe(true);
  });

  it("returns no dasha facts for a western chart", () => {
    expect(deriveFacts({ ...chart, tradition: "western", dasha: undefined }).dasha).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/astrology/derived.test.ts`
Expected: FAIL — `deriveFacts is not a function`.

- [ ] **Step 3: Implement it**

Append to `lib/astrology/derived.ts`:

```ts
export function deriveFacts(chart: Chart): Derived {
  const asc = chart.ascendant.sign;
  const sun = chart.planets.find((p) => p.name === "Sun");

  // Houses are recomputed here rather than read from `planet.house`, so a
  // chart stored before the whole-sign change still derives correctly. That is
  // what lets this ship without a backfill.
  const houseOfPlanet = new Map(chart.planets.map((p) => [p.name, houseFrom(asc, p.sign)]));
  const inHouse = (n: number) => chart.planets.filter((p) => houseOfPlanet.get(p.name) === n);

  const planets: PlanetFact[] = chart.planets.map((p) => {
    const house = houseOfPlanet.get(p.name) ?? 0;
    const { dignity, fromDeepPoint } = dignityOf(p.name, p.sign, p.degree);
    const aspects = aspectedHouses(p.name, house);
    return {
      name: p.name,
      sign: p.sign,
      degree: p.degree,
      house,
      nakshatra: p.nakshatra,
      retrograde: p.retrograde,
      rules: signsRuledBy(p.name).map((sign) => houseFrom(asc, sign)).sort((a, b) => a - b),
      dignity,
      fromDeepPoint,
      combust: sun ? isCombust(p, sun) : false,
      fromSun: sun && p.name !== "Sun" ? Number(arcFromSun(p, sun).toFixed(2)) : undefined,
      aspects,
      aspectsPlanets: aspects.flatMap((h) => inHouse(h).map((x) => x.name)),
      conjunct: inHouse(house).filter((x) => x.name !== p.name).map((x) => x.name),
    };
  });

  const byName = new Map(planets.map((f) => [f.name, f]));
  const ascIndex = signIndex(asc);

  const houses: HouseFact[] = Array.from({ length: 12 }, (_, i) => {
    const number = i + 1;
    const sign = Object.keys(SIGN_LORD)[(ascIndex + i) % 12];
    const lord = SIGN_LORD[sign];
    const lordFact = byName.get(lord);
    return {
      number,
      sign,
      lord,
      lordHouse: lordFact?.house ?? 0,
      lordSign: lordFact?.sign ?? "",
      lordDignity: lordFact?.dignity ?? "neutral",
      occupants: inHouse(number).map((p) => p.name),
      aspectedBy: planets.filter((f) => f.aspects.includes(number)).map((f) => f.name),
    };
  });

  const dasha: DashaFact[] = chart.dasha
    ? [
        {
          level: "mahadasha" as const,
          lord: chart.dasha.mahadasha,
          start: chart.dasha.mahadashaStart,
          end: chart.dasha.mahadashaEnd,
          placement: byName.get(chart.dasha.mahadasha),
        },
        {
          level: "antardasha" as const,
          lord: chart.dasha.antardasha,
          start: chart.dasha.antardashaStart,
          end: chart.dasha.antardashaEnd,
          placement: byName.get(chart.dasha.antardasha),
        },
      ]
    : [];

  return { planets, houses, dasha, conditions: detectNatalDoshas(chart) };
}
```

Note: `Object.keys(SIGN_LORD)` is relied on for zodiacal order. The literal is written in that order and must stay that way; the `oppositeSign` helper depends on it too.

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/astrology/derived.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/astrology/derived.ts lib/astrology/derived.test.ts
git commit -m "feat(astrology): deriveFacts reads a chart with lords, aspects and dasha placement"
```

---

### Task 5: Store derived facts, and upgrade stale charts lazily

**Files:**
- Modify: `lib/astrology/types.ts`
- Modify: `lib/astrology/chart.ts`
- Modify: `lib/data/birthProfile.ts`
- Test: `lib/astrology/chart.test.ts`

**Interfaces:**
- Consumes: `deriveFacts`, `CHART_SCHEMA_VERSION`.
- Produces: `Chart.derived?: Derived`; `factsFor(chart: Chart): Derived` and `isChartStale(chart: Chart): boolean` exported from `lib/astrology/derived.ts`; `ensureCurrentChart(profile, db?)` exported from `lib/data/birthProfile.ts`.

- [ ] **Step 1: Write the failing test**

Append to `lib/astrology/chart.test.ts`:

```ts
import { factsFor, isChartStale } from "./derived";

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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/astrology/chart.test.ts`
Expected: FAIL — `factsFor` is not exported and `chart.derived` is undefined.

- [ ] **Step 3: Add the field and the two helpers**

In `lib/astrology/types.ts`, add the import and the field:

```ts
import type { Derived } from "./derived";
```

```ts
  /** Classical readings of the positions above. See lib/astrology/derived.ts. */
  derived?: Derived;
```

Append to `lib/astrology/derived.ts`:

```ts
import { CHART_SCHEMA_VERSION } from "./chart";

/**
 * A chart written before the whole-sign change carries house numbers that
 * disagree with every renderer's rashi labels. Readers use this to decide
 * whether to rewrite it.
 */
export function isChartStale(chart: Chart): boolean {
  return (chart.schemaVersion ?? 1) < CHART_SCHEMA_VERSION || !chart.derived;
}

/** The stored facts, or freshly computed ones for a chart written before this shipped. */
export function factsFor(chart: Chart): Derived {
  return chart.derived ?? deriveFacts(chart);
}
```

If this creates an import cycle between `chart.ts` and `derived.ts`, move `CHART_SCHEMA_VERSION` into `lib/astrology/constants.ts` and import it from there in both files. Verify with `npx tsc --noEmit`.

- [ ] **Step 4: Populate it in computeChart**

In `lib/astrology/chart.ts`, import `deriveFacts` and build the chart in two steps so the derived block can read the finished object:

```ts
import { deriveFacts } from "./derived";
```

Replace the `return { ... }` at the end with:

```ts
  const result: Chart = {
    tradition,
    ascendant: { sign: ascSign, degree: Number(degreeInSign(ascLon).toFixed(2)) },
    houses: cusps.map((c) => Number(c.toFixed(2))),
    planets,
    moonSign: moon.sign,
    sunSign: sun.sign,
    ayanamsa: ayanamsa !== undefined ? Number(ayanamsa.toFixed(3)) : undefined,
    dasha: tradition === "vedic" ? computeVimshottari(moonAbsLon, ut) : undefined,
    schemaVersion: CHART_SCHEMA_VERSION,
  };
  return { ...result, derived: deriveFacts(result) };
```

- [ ] **Step 5: Add the lazy upgrade**

Append to `lib/data/birthProfile.ts`:

```ts
/**
 * Rewrites a stored chart that predates the whole-sign change.
 *
 * Readers can always derive correct facts in process, but the numbers the
 * kundli, the PDF and the iOS app draw come from the stored chart, so it has to
 * be rewritten for those to agree. Doing it on read means no migration and no
 * backfill job: a chart corrects the first time its owner uses the app.
 *
 * Both traditions are recomputed together, so a profile is never half upgraded.
 * A failure is swallowed: an upgrade that cannot be written is not a reason to
 * fail the request that triggered it.
 */
export async function ensureCurrentChart(
  profile: BirthProfileRow,
  db?: Db,
): Promise<BirthProfileRow> {
  const stored = profile.chart as { vedic?: Chart; western?: Chart } | null;
  if (!stored?.vedic || !isChartStale(stored.vedic)) return profile;

  try {
    const birth: BirthInput = {
      birthDate: String(profile.birth_date),
      birthTime: String(profile.birth_time).slice(0, 5),
      lat: Number(profile.lat),
      lng: Number(profile.lng),
      timezone: String(profile.timezone),
    };
    const [vedic, western] = await Promise.all([
      computeChart(birth, "vedic"),
      computeChart(birth, "western"),
    ]);
    const supabase = db ?? (await createServerSupabase());
    await supabase
      .from("birth_profiles")
      .update({ chart: { vedic, western } })
      .eq("user_id", profile.user_id);
    return { ...profile, chart: { vedic, western } };
  } catch (err) {
    console.error("chart upgrade skipped", err);
    return profile;
  }
}
```

Add the needed imports at the top of that file:

```ts
import { isChartStale } from "@/lib/astrology/derived";
import type { Chart } from "@/lib/astrology/types";
```

- [ ] **Step 6: Run the suite and the type check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/astrology/types.ts lib/astrology/chart.ts lib/astrology/derived.ts lib/astrology/chart.test.ts lib/data/birthProfile.ts
git commit -m "feat(astrology): store derived facts and upgrade stale charts on read"
```

---

### Task 6: Natal conditions must not re-alert after the house change

**Files:**
- Modify: `lib/alerts/run.ts:121-180`
- Test: `lib/alerts/run.test.ts` (create if absent)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exports; changes the behaviour of the existing alerts run.

**Why this task exists.** `detectNatalDoshas` reads `planet.house`. Mangal dosha is Mars in house 1, 2, 4, 7, 8 or 12, and its signature embeds the number — `mangal_dosha:${mars.house}` (`lib/astrology/doshas.ts:71`). Task 2 changes those numbers, so when Task 5 rewrites a stored chart, natal signatures shift. `lib/alerts/run.ts:134` treats an unmatched signature as a condition **starting** and sends a push. Left alone, the first run after an upgrade would tell people Mangal Dosha had just begun — about a birth chart that has not changed since they were born.

**The rule.** A natal condition cannot genuinely begin or end; it is fixed at birth. So any change in one is an artifact of our computation, never an event. Natal conditions therefore alert **only** on a user's first read — when they have no natal rows at all — and are reconciled silently forever after. Transit conditions are untouched: those do change, daily, and are the point of the feature.

This replaces the `schemaVersion` marker the spec proposed in §7. It needs no stored version and no schema change, and it is correct for any future computation change, not just this one.

- [ ] **Step 1: Write the failing test**

Create `lib/alerts/run.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { partitionForAlerts } from "./run";

type Row = { signature: string; scope: "natal" | "transit" };
const c = (signature: string, scope: "natal" | "transit") => ({ signature, scope });

describe("partitionForAlerts", () => {
  it("alerts natal conditions on a first read, when no natal rows exist", () => {
    const { alert, silent } = partitionForAlerts({
      started: [c("mangal_dosha:7", "natal"), c("sade_sati:peak", "transit")],
      hadNatalRows: false,
    });
    expect(alert.map((x) => x.signature)).toEqual(["mangal_dosha:7", "sade_sati:peak"]);
    expect(silent).toEqual([]);
  });

  it("never alerts a natal condition once the user has natal rows", () => {
    const { alert, silent } = partitionForAlerts({
      started: [c("mangal_dosha:8", "natal"), c("sade_sati:peak", "transit")],
      hadNatalRows: true,
    });
    expect(alert.map((x) => x.signature)).toEqual(["sade_sati:peak"]);
    expect(silent.map((x) => x.signature)).toEqual(["mangal_dosha:8"]);
  });

  it("keeps transit conditions alertable in both cases", () => {
    for (const hadNatalRows of [true, false]) {
      const { alert } = partitionForAlerts({ started: [c("kantaka_shani:4", "transit")], hadNatalRows });
      expect(alert).toHaveLength(1);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/alerts/run.test.ts`
Expected: FAIL — `partitionForAlerts` is not exported.

- [ ] **Step 3: Add the helper**

In `lib/alerts/run.ts`, add:

```ts
/**
 * Which newly-detected conditions are worth waking someone for.
 *
 * A natal condition is fixed at birth: it cannot start or end, so a change in
 * one is always an artifact of the computation changing — a house system, a
 * detector, an ayanamsa — and never an event. Those are recorded silently. The
 * one exception is a user's first read, where the whole natal set is genuinely
 * news to them.
 *
 * Transit conditions are the opposite: changing is what they do.
 */
export function partitionForAlerts<T extends { scope: string }>(args: {
  started: T[];
  hadNatalRows: boolean;
}): { alert: T[]; silent: T[] } {
  if (!args.hadNatalRows) return { alert: args.started, silent: [] };
  return {
    alert: args.started.filter((c) => c.scope !== "natal"),
    silent: args.started.filter((c) => c.scope === "natal"),
  };
}
```

- [ ] **Step 4: Use it in the run**

The existing select at line 126 filters `.is("ended_on", null)`, so it cannot tell whether a user has ever had a natal row. Add a separate count query before the diff:

```ts
  const { count: natalCount } = await admin
    .from("transit_conditions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.user_id)
    .eq("scope", "natal");
  const hadNatalRows = (natalCount ?? 0) > 0;
```

Then, after `started` and `ended` are computed, split them:

```ts
  const { alert: toAlert } = partitionForAlerts({ started, hadNatalRows });
```

Every row in `started` is still inserted, exactly as now — the change is only that alerts and pushes are built from `toAlert` instead of `started`. Apply the same filter to `ended`: a natal condition disappearing is the same artifact in reverse.

```ts
  const { alert: endedToAlert } = partitionForAlerts({ started: ended, hadNatalRows });
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- lib/alerts/run.test.ts && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/alerts/run.ts lib/alerts/run.test.ts
git commit -m "fix(alerts): never alert on a natal condition changing

A natal dosha is fixed at birth, so a change in one is always our
computation moving, never an event. Moving Vedic charts to whole-sign
houses shifts Mangal's signature, which would otherwise have pushed
'Mangal Dosha has begun' to people whose chart has not changed since
they were born."
```

---

## Phase 2 — Reaching the model

### Task 7: Gochara

**Files:**
- Modify: `lib/astrology/transits.ts:53-58`
- Create: `lib/astrology/transits.test.ts`
- Modify: `app/api/chat/route.ts:80-92`

**Interfaces:**
- Consumes: `houseFrom` (Task 1), `detectTransitAfflictions` (existing).
- Produces: `describeGochara(natal: Chart, transit: Chart): string`. `describeTransits` is deleted.

- [ ] **Step 1: Write the failing test**

Create `lib/astrology/transits.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/astrology/transits.test.ts`
Expected: FAIL — `describeGochara` is not exported.

- [ ] **Step 3: Replace describeTransits**

In `lib/astrology/transits.ts`, delete `describeTransits` and add:

```ts
import { houseFrom } from "./constants";
import { detectTransitAfflictions } from "./doshas";

/**
 * Today's sky read against this person's chart.
 *
 * The old text — "Saturn in Pisces, Jupiter in Gemini" — was true of everyone
 * alive on that date and related to the reader not at all, which is most of why
 * answers about "now" came back generic. What makes a transit mean anything is
 * the house it falls in from the lagna and, in gochara proper, from the natal
 * Moon.
 *
 * Still day-stable: the transit chart is sampled once per day at midday UTC, so
 * this text can sit in the cached half of the system prompt.
 */
export function describeGochara(natal: Chart, transit: Chart): string {
  const asc = natal.ascendant.sign;
  const moonSign = natal.moonSign;
  const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th",
                   "10th", "11th", "12th"];

  const lines = transit.planets.map((t) => {
    const fromAsc = houseFrom(asc, t.sign);
    const fromMoon = houseFrom(moonSign, t.sign);
    const touching = natal.planets
      .filter((n) => n.sign === t.sign)
      .map((n) => `natal ${n.name}`);
    const parts = [
      `${t.name} in ${t.sign}${t.retrograde ? " (retrograde)" : ""}`,
      `house ${fromAsc} from the ascendant`,
      `${ORDINAL[fromMoon]} from the Moon`,
    ];
    if (touching.length > 0) parts.push(`over ${touching.join(" and ")}`);
    return `- ${parts.join(", ")}.`;
  });

  const afflictions = detectTransitAfflictions(natal, transit);
  if (afflictions.length > 0) {
    lines.push(...afflictions.map((c) => `- ${c.label}: ${c.detail}`));
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Update the one call site**

In `app/api/chat/route.ts`, change the import and the call:

```ts
import { transitChart, describeGochara, describeToday } from "@/lib/astrology/transits";
```

```ts
        transits = describeGochara(
          chart,
          await transitChart({
            lat: Number(profile.lat),
            lng: Number(profile.lng),
            tradition: body.tradition as Tradition,
          }),
        );
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/astrology/transits.ts lib/astrology/transits.test.ts app/api/chat/route.ts
git commit -m "feat(astrology): transits read against the chart, not just listed"
```

---

### Task 8: Render the derived facts into the prompt

**Files:**
- Modify: `lib/astrology/prompt.ts:4-18` and `:20-70`
- Modify: `lib/astrology/prompt.test.ts`
- Modify: `app/api/chat/route.ts:94-100`

**Interfaces:**
- Consumes: `Derived`, `factsFor` (Tasks 4-5); `describeGochara` (Task 7).
- Produces: `buildChartSystem` gains a required `derived: Derived` argument. `buildSystemPrompt` gains an optional `derived`, defaulting to `factsFor(chart)`.

- [ ] **Step 1: Write the failing test**

Append to `lib/astrology/prompt.test.ts`:

```ts
import { deriveFacts } from "./derived";

describe("derived facts in the prompt", () => {
  const derived = deriveFacts(chart);
  const p = buildChartSystem({ firstName: "Aditi", tradition: "vedic", chart, derived });

  it("names what each planet rules and how strong it is", () => {
    expect(p).toMatch(/Sun:[^\n]*rules house/);
    expect(p).toMatch(/Moon:[^\n]*(exalted|debilitated|own|moolatrikona|neutral)/);
  });

  it("names the houses each planet aspects", () => {
    expect(p).toMatch(/aspects houses/);
  });

  it("gives every house its lord and where that lord sits", () => {
    expect(p).toContain("HOUSES");
    expect(p).toMatch(/House 7[^\n]*lord [A-Z][a-z]+ in house \d+/);
  });

  it("says where the dasha lord actually sits", () => {
    expect(p).toContain("Venus");
    expect(p).toMatch(/mahadasha[^]*Venus[^]*house \d+/i);
  });

  it("bans the generic register outright", () => {
    const lower = p.toLowerCase();
    expect(lower).toContain("true of a twelfth of the population");
  });

  it("still forbids inventing placements", () => {
    expect(p.toLowerCase()).toContain("never state a placement");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/astrology/prompt.test.ts`
Expected: FAIL — `buildChartSystem` does not accept `derived`, and none of the new strings appear.

- [ ] **Step 3: Replace renderChart**

In `lib/astrology/prompt.ts`, delete `renderChart` and add:

```ts
import type { Derived, PlanetFact } from "./derived";

const DIGNITY_WORD: Record<string, string> = {
  exalted: "exalted",
  debilitated: "debilitated",
  moolatrikona: "in moolatrikona",
  own: "in its own sign",
  neutral: "neutral",
};

function planetLine(f: PlanetFact): string {
  const bits: string[] = [];
  if (f.rules.length > 0) bits.push(`rules house${f.rules.length > 1 ? "s" : ""} ${f.rules.join(", ")}`);
  bits.push(DIGNITY_WORD[f.dignity]);
  if (f.fromDeepPoint !== undefined && f.fromDeepPoint < 1) bits.push("within a degree of exact");
  if (f.combust) bits.push(`combust, ${f.fromSun}° from the Sun`);
  if (f.retrograde) bits.push("retrograde");
  if (f.aspects.length > 0) bits.push(`aspects houses ${f.aspects.join(", ")}`);
  if (f.conjunct.length > 0) bits.push(`with ${f.conjunct.join(" and ")}`);
  const nak = f.nakshatra ? `, ${f.nakshatra}` : "";
  return `${f.name}: ${f.sign} ${f.degree}°, house ${f.house}${nak} — ${bits.join(" · ")}`;
}

function renderChartFacts(chart: Chart, d: Derived): string {
  const out: string[] = [];

  out.push(`Ascendant: ${chart.ascendant.sign} ${chart.ascendant.degree}° (sets house 1)`);
  out.push(`Sun ${chart.sunSign} | Moon ${chart.moonSign}`);

  out.push("", "PLACEMENTS:");
  out.push(...d.planets.map(planetLine));

  out.push("", "HOUSES (sign, its lord, and where that lord sits):");
  for (const h of d.houses) {
    const who = h.occupants.length > 0 ? `holds ${h.occupants.join(", ")}` : "empty";
    const seen = h.aspectedBy.length > 0 ? `, aspected by ${h.aspectedBy.join(", ")}` : "";
    out.push(
      `House ${h.number}: ${h.sign}, lord ${h.lord} in house ${h.lordHouse} (${h.lordSign}, ${DIGNITY_WORD[h.lordDignity]}) — ${who}${seen}`,
    );
  }

  if (d.dasha.length > 0) {
    out.push("", "CURRENT PERIOD (the lord's own placement is what gives it its character):");
    for (const p of d.dasha) {
      const where = p.placement
        ? `natally in ${p.placement.sign} ${p.placement.degree}°, house ${p.placement.house}, ` +
          `${DIGNITY_WORD[p.placement.dignity]}` +
          (p.placement.rules.length > 0 ? `, ruling houses ${p.placement.rules.join(", ")}` : ", ruling no house")
        : "not a body in this chart";
      out.push(`${p.level}: ${p.lord}, ${p.start} to ${p.end} — ${where}.`);
    }
  }

  if (d.conditions.length > 0) {
    out.push("", "STANDING CONDITIONS IN THE BIRTH CHART:");
    out.push(...d.conditions.map((c) => `${c.label}: ${c.detail}`));
  }

  return out.join("\n");
}
```

- [ ] **Step 4: Thread `derived` through and tighten the rules**

Change the `buildChartSystem` signature to add `derived: Derived`, and its body to call `renderChartFacts(args.chart, args.derived)` in place of `renderChart(args.chart)`.

Replace the "Accuracy" and "How to answer" sections of the returned template with:

```
Accuracy:
- Never state a placement, lordship, aspect, dasha, condition or number that is not listed above. Interpret only this data.
- Every claim names the placement it reads from, the house that placement is in, and the technique — lordship, aspect, dignity, dasha, or transit. A sentence with no placement behind it does not go in the answer.
- Describe tendencies and timing, never guaranteed outcomes. No medical, legal, or financial guarantees.
- If the chart does not show what they asked about, say what it does show. If one missing detail would change your answer, ask one short question instead of guessing.

How to answer:
- Answer the question ${args.firstName} actually asked, from this chart.
- No sign-personality writing. A sentence that would be true of a twelfth of the population is not an answer — if what you have written would fit anyone with this Sun sign, delete it and read a house lord, an aspect, or the dasha lord's placement instead.
- Name the placement you are reading from, then say what it means in plain terms. Do not list the chart back at them.
- In a conversation, build on what you already said instead of repeating it.
- For anything about work, money, love, health, or family, say what the chart indicates and what it asks of them.
```

Update `buildSystemPrompt` to accept an optional `derived` and default it:

```ts
  const chartPart = buildChartSystem({ ...args, derived: args.derived ?? factsFor(args.chart) });
```

with `import { factsFor } from "./derived";` at the top and `derived?: Derived;` added to its argument type.

- [ ] **Step 5: Update the chat route**

In `app/api/chat/route.ts`, after `const chart = ...`:

```ts
      const derived = factsFor(chart);
```

and pass it:

```ts
      stableSystem = buildChartSystem({
        firstName: profile.first_name,
        tradition: body.tradition as Tradition,
        chart,
        derived,
        numerology: num,
      });
```

Add `import { factsFor } from "@/lib/astrology/derived";`.

- [ ] **Step 6: Run the tests and the type check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/astrology/prompt.ts lib/astrology/prompt.test.ts app/api/chat/route.ts
git commit -m "feat(chat): the prompt carries lords, aspects, dignity and the dasha lord's placement"
```

---

### Task 9: Use the upgraded chart in the chat route

**Files:**
- Modify: `app/api/chat/route.ts:48-53`

**Interfaces:**
- Consumes: `ensureCurrentChart` (Task 5).
- Produces: nothing new.

The chat route selects the profile directly rather than through `getBirthProfile`, so it needs the upgrade call explicitly. This is what makes a returning user's stored chart correct itself.

- [ ] **Step 1: Call the upgrade after loading the profile**

Replace the profile load with:

```ts
    const { data: loaded } = await supabase
      .from("birth_profiles")
      .select("user_id, first_name, last_name, birth_date, birth_time, lat, lng, timezone, chart")
      .maybeSingle();
    if (!loaded?.chart) return new Response("No chart. Complete intake first.", { status: 400 });
    const profile = await ensureCurrentChart(loaded as BirthProfileRow, supabase);
```

Note `birth_time` and `user_id` are added to the select, because `ensureCurrentChart` needs them to recompute. Add the imports:

```ts
import { ensureCurrentChart, type BirthProfileRow } from "@/lib/data/birthProfile";
```

- [ ] **Step 2: Verify the route still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Manual check against a real account**

Run: `npm run dev`, sign in, and send one Vedic message. Confirm in the response that a house lord or an aspect is named. Then re-open the kundli screen and confirm the house numbers match the rashi labels.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(chat): upgrade a stale stored chart on first use"
```

---

## Phase 3 — Numerology

### Task 10: Personal year, Lo Shu grid, number relationships

**Files:**
- Modify: `lib/astrology/numerology.ts`
- Modify: `lib/astrology/numerology.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `personalYear(birthDate, today)`, `personalMonth(birthDate, today)`, `loShu(birthDate)`, `numberRelationship(a, b)`, all exported from `lib/astrology/numerology.ts`.

- [ ] **Step 1: Write the failing test**

Append to `lib/astrology/numerology.test.ts`:

```ts
import { personalYear, personalMonth, loShu, numberRelationship } from "./numerology";

describe("personalYear", () => {
  it("reduces birth month plus birth day plus the current year", () => {
    // 1990-07-15 in 2026: 7 + 15 + 2026 = 2048 -> 2+0+4+8 = 14 -> 5
    expect(personalYear("1990-07-15", "2026-09-17")).toBe(5);
  });

  it("is stable across the whole calendar year", () => {
    expect(personalYear("1990-07-15", "2026-01-01")).toBe(personalYear("1990-07-15", "2026-12-31"));
  });
});

describe("personalMonth", () => {
  it("adds the calendar month to the personal year and reduces", () => {
    // personal year 5 in Sept (9): 5 + 9 = 14 -> 5
    expect(personalMonth("1990-07-15", "2026-09-17")).toBe(5);
  });
});

describe("loShu", () => {
  const grid = loShu("1990-07-15");

  it("counts every digit of the birth date, ignoring zeros", () => {
    // 1 9 9 0 0 7 1 5 -> 1:2, 5:1, 7:1, 9:2
    expect(grid.counts[1]).toBe(2);
    expect(grid.counts[9]).toBe(2);
    expect(grid.counts[7]).toBe(1);
    expect(grid.counts[5]).toBe(1);
  });

  it("lists which digits are missing", () => {
    expect(grid.missing).toEqual([2, 3, 4, 6, 8]);
  });

  it("lists which digits repeat", () => {
    expect(grid.repeated).toEqual([1, 9]);
  });
});

describe("numberRelationship", () => {
  it("reads the friendship of the planets ruling the two numbers", () => {
    expect(numberRelationship(1, 2)).toBe("friend"); // Sun and Moon
    expect(numberRelationship(1, 6)).toBe("enemy"); // Sun and Venus
    expect(numberRelationship(1, 5)).toBe("neutral"); // Sun and Mercury
  });

  it("treats a number as its own friend", () => {
    expect(numberRelationship(3, 3)).toBe("friend");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/astrology/numerology.test.ts`
Expected: FAIL — none of the four functions exist.

- [ ] **Step 3: Implement them**

Append to `lib/astrology/numerology.ts`:

```ts
/**
 * The cycle a person is in this year, by the common Vedic reckoning: birth
 * month plus birth day plus the current calendar year, reduced.
 *
 * It changes once a year, which is why the prompt carries it in the half that
 * varies rather than the cached half.
 */
export function personalYear(birthDate: string, today: string): number {
  const [, bm, bd] = birthDate.split("-").map(Number);
  const year = Number(today.slice(0, 4));
  return reduceToDigit(bm + bd + year);
}

export function personalMonth(birthDate: string, today: string): number {
  const month = Number(today.slice(5, 7));
  return reduceToDigit(personalYear(birthDate, today) + month);
}

export type LoShu = {
  /** How many times each digit 1-9 appears in the birth date. */
  counts: Record<number, number>;
  missing: number[];
  repeated: number[];
};

/**
 * Which digits the birth date repeats and which it lacks.
 *
 * This is the most concrete thing numerology has: "three 1s and no 4" is
 * specific in a way "your mulank is 5" can never be. Zeros are not placed on
 * the grid, by the classical arrangement.
 */
export function loShu(birthDate: string): LoShu {
  const counts: Record<number, number> = {};
  for (let d = 1; d <= 9; d++) counts[d] = 0;
  for (const ch of birthDate.replace(/-/g, "")) {
    const d = Number(ch);
    if (d >= 1 && d <= 9) counts[d] += 1;
  }
  const digits = Object.keys(counts).map(Number);
  return {
    counts,
    missing: digits.filter((d) => counts[d] === 0),
    repeated: digits.filter((d) => counts[d] > 1),
  };
}

/**
 * Numbers 1-9 are ruled by planets, and their relationship is those planets'
 * natural friendship.
 *
 * Rahu (4) and Ketu (7) have no friendships the tradition agrees on. They are
 * given Saturn's and Mercury's rows respectively, which is the most common
 * numerological practice — a convention, not a rule, kept here in one place so
 * it can be corrected in one place.
 */
const NUMBER_RULER: Record<number, string> = {
  1: "Sun", 2: "Moon", 3: "Jupiter", 4: "Saturn", 5: "Mercury",
  6: "Venus", 7: "Mercury", 8: "Saturn", 9: "Mars",
};

const FRIENDS: Record<string, string[]> = {
  Sun: ["Moon", "Mars", "Jupiter"],
  Moon: ["Sun", "Mercury"],
  Mars: ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"],
  Jupiter: ["Sun", "Moon", "Mars"],
  Venus: ["Mercury", "Saturn"],
  Saturn: ["Mercury", "Venus"],
};

const ENEMIES: Record<string, string[]> = {
  Sun: ["Venus", "Saturn"],
  Moon: [],
  Mars: ["Mercury"],
  Mercury: ["Moon"],
  Jupiter: ["Mercury", "Venus"],
  Venus: ["Sun", "Moon"],
  Saturn: ["Sun", "Moon", "Mars"],
};

export function numberRelationship(a: number, b: number): "friend" | "neutral" | "enemy" {
  const pa = NUMBER_RULER[a];
  const pb = NUMBER_RULER[b];
  if (!pa || !pb) return "neutral";
  if (pa === pb) return "friend";
  if (FRIENDS[pa]?.includes(pb)) return "friend";
  if (ENEMIES[pa]?.includes(pb)) return "enemy";
  return "neutral";
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/astrology/numerology.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/astrology/numerology.ts lib/astrology/numerology.test.ts
git commit -m "feat(numerology): personal year and month, Lo Shu grid, number relationships"
```

---

### Task 11: Numerology prompt

**Files:**
- Modify: `lib/astrology/prompt.ts:105-142`
- Modify: `lib/astrology/prompt.test.ts`
- Modify: `app/api/chat/route.ts:66-77`

**Interfaces:**
- Consumes: Task 10's four functions.
- Produces: `buildNumerologySystem` gains `loShu` and `relationships`; `buildTodaySystem` gains optional `personal`.

- [ ] **Step 1: Write the failing test**

Append to `lib/astrology/prompt.test.ts`:

```ts
import { buildNumerologySystem } from "./prompt";
import { loShu, numberRelationship } from "./numerology";

describe("numerology prompt", () => {
  const p = buildNumerologySystem({
    firstName: "Aditi",
    fullName: "Aditi Sharma",
    mulank: 6,
    bhagyank: 3,
    namank: 1,
    grid: loShu("1990-07-15"),
    namankToMulank: numberRelationship(1, 6),
  });

  it("names which digits repeat and which are missing", () => {
    expect(p).toContain("Repeated");
    expect(p).toContain("Missing");
  });

  it("says how the name number sits with the root number", () => {
    expect(p).toMatch(/namank[^\n]*(friend|neutral|enemy)/i);
  });

  it("keeps the exact-numbers rule", () => {
    expect(p.toLowerCase()).toContain("never invent or alter one");
  });
});

describe("buildTodaySystem with personal cycles", () => {
  it("carries the personal year and month", () => {
    const t = buildTodaySystem({ today: "Tuesday", personal: { year: 5, month: 5 } });
    expect(t).toContain("personal year 5");
    expect(t).toContain("personal month 5");
  });

  it("omits them when absent", () => {
    expect(buildTodaySystem({ today: "Tuesday" })).not.toContain("personal year");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- lib/astrology/prompt.test.ts`
Expected: FAIL — the arguments are not accepted.

- [ ] **Step 3: Extend the two builders**

In `buildNumerologySystem`, add `grid: LoShu` and `namankToMulank: "friend" | "neutral" | "enemy"` to the argument type (importing `LoShu` from `./numerology`), and insert after the three number lines:

```ts
- Repeated digits in the birth date: ${args.grid.repeated.join(", ") || "none"}.
- Missing digits: ${args.grid.missing.join(", ") || "none"}.
- The namank ${args.namank} is a ${args.namankToMulank} of the mulank ${args.mulank}.
```

In `buildTodaySystem`, add `personal?: { year: number; month: number }` and, when present:

```ts
  if (args.personal) {
    lines.push(
      `They are in personal year ${args.personal.year} and personal month ${args.personal.month}. ` +
        `Use these for anything about this year or this month.`,
    );
  }
```

- [ ] **Step 4: Wire the route**

In `app/api/chat/route.ts`, in the numerology branch:

```ts
      stableSystem = buildNumerologySystem({
        firstName: profile.first_name,
        fullName,
        mulank: num.mulank,
        bhagyank: num.bhagyank,
        namank: computeNameNumber(fullName),
        grid: loShu(String(profile.birth_date)),
        namankToMulank: numberRelationship(computeNameNumber(fullName), num.mulank),
      });
      todaySystem = buildTodaySystem({
        today,
        maxWords,
        personal: {
          year: personalYear(String(profile.birth_date), nowLocal.toFormat("yyyy-LL-dd")),
          month: personalMonth(String(profile.birth_date), nowLocal.toFormat("yyyy-LL-dd")),
        },
      });
```

Extend the numerology import to include `loShu`, `numberRelationship`, `personalYear`, `personalMonth`.

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/astrology/prompt.ts lib/astrology/prompt.test.ts app/api/chat/route.ts
git commit -m "feat(numerology): the reading sees the grid and the personal cycle"
```

---

## Phase 4 — iOS

Phase 4 is shippable separately. After Phase 3, the phone already gets correct house numbers, a correct kundli and a correct PDF with no app release, because every Swift site reads the house number from the stored chart. Phase 4 adds only the richer on-device answers.

### Task 12: Decode the derived facts

**Files:**
- Modify: `mobile/Sanchara/Sources/Features/Kundli/ChartData.swift:17-30`

**Interfaces:**
- Consumes: the JSON shape of `Derived` (Task 4).
- Produces: `DerivedFacts`, `DerivedPlanet`, `DerivedHouse`, `DerivedPeriod`; `NatalChart.derived: DerivedFacts?`.

- [ ] **Step 1: Add the types**

In `mobile/Sanchara/Sources/Features/Kundli/ChartData.swift`, add after `ChartPlanet`:

```swift
/// The classical readings the server derives from the positions.
///
/// Mirrors `lib/astrology/derived.ts` field for field, the same way
/// `NatalChart` mirrors `types.ts`. Everything is optional at the top level:
/// a chart cached in the app group before this shipped decodes with `derived`
/// nil, and every consumer falls back to what it printed before. A widget or a
/// Siri intent must never fail to decode a chart it has already stored.
///
/// Conditions are deliberately not carried. They are interpretive, and the
/// on-device model is only allowed to restate records.
struct DerivedFacts: Codable, Equatable, Sendable {
    let planets: [DerivedPlanet]
    let houses: [DerivedHouse]
    let dasha: [DerivedPeriod]

    func planet(named name: String) -> DerivedPlanet? {
        planets.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    func house(_ number: Int) -> DerivedHouse? {
        houses.first { $0.number == number }
    }
}

struct DerivedPlanet: Codable, Equatable, Sendable {
    let name: String
    let house: Int
    let rules: [Int]
    let dignity: String
    let combust: Bool
    let fromSun: Double?
    let aspects: [Int]
    let conjunct: [String]
}

struct DerivedHouse: Codable, Equatable, Sendable {
    let number: Int
    let sign: String
    let lord: String
    let lordHouse: Int
    let occupants: [String]
}

struct DerivedPeriod: Codable, Equatable, Sendable {
    let level: String
    let lord: String
    let placement: DerivedPlanet?
}
```

Add the property to `NatalChart`:

```swift
    let derived: DerivedFacts?
```

- [ ] **Step 2: Fix the fixtures the compiler now rejects**

`NatalChart` has a memberwise initialiser used by tests. Add `derived: nil` to every construction site. Find them:

```bash
grep -rn "NatalChart(" mobile/Sanchara/Sources mobile/Sanchara/Tests
```

- [ ] **Step 3: Build**

Run: `xcodebuild -project mobile/Sanchara.xcodeproj -scheme Sanchara -destination 'platform=iOS Simulator,name=iPhone 16' build`
Expected: BUILD SUCCEEDED. If the project is generated by XcodeGen, run `xcodegen generate` in `mobile/` first.

- [ ] **Step 4: Commit**

```bash
git add mobile/Sanchara/Sources/Features/Kundli/ChartData.swift
git commit -m "feat(ios): decode the server's derived chart facts"
```

---

### Task 13: Richer rows in the on-device table

**Files:**
- Modify: `mobile/Sanchara/Sources/Features/Chat/ChartFacts.swift:23-58`
- Create: `mobile/Sanchara/Tests/ChartFactsTests.swift`

**Interfaces:**
- Consumes: `DerivedFacts` (Task 12).
- Produces: no new API. `body(named:)`, `section(_:)` and `currentPeriod()` return richer text when `chart.derived` is present.

**The constraint, restated because it is the whole difficulty of this task.** Apple's on-device model refuses text it reads as fortune telling — this was found by testing, and is why the file already says "section" rather than "house". Every new row must use the neutral vocabulary below and no astrological word:

| Real term | Row text |
| --- | --- |
| lord of the 7th | `Section 7 is controlled by Venus.` |
| aspects houses 10, 2, 5 | `Linked to sections 10, 2, 5.` |
| exalted | `Strength rating: highest.` |
| debilitated | `Strength rating: lowest.` |
| moolatrikona, own | `Strength rating: high.` |
| neutral | `Strength rating: standard.` |
| combust | `Within 4 degrees of Sun.` |

- [ ] **Step 1: Write the failing test**

Create `mobile/Sanchara/Tests/ChartFactsTests.swift`:

```swift
import XCTest
@testable import Sanchara

/// The table the on-device model reads.
///
/// Two things are asserted and both matter. That the derived rows appear when
/// the server sent them, and that every row falls back cleanly when it did not
/// — a chart cached before derived facts shipped must still answer.
///
/// The third property, that the real model does not refuse this wording, cannot
/// be tested here. See the release gate in the plan.
final class ChartFactsTests: XCTestCase {

    private let venus = DerivedPlanet(
        name: "Venus", house: 7, rules: [7, 12], dignity: "exalted",
        combust: false, fromSun: 41.2, aspects: [1], conjunct: []
    )

    private func chart(derived: DerivedFacts?) -> NatalChart {
        NatalChart(
            tradition: "vedic",
            ascendant: .init(sign: "Scorpio", degree: 14.5),
            planets: [
                ChartPlanet(name: "Venus", sign: "Taurus", degree: 2.0, house: 7,
                            retrograde: false, nakshatra: "Krittika"),
            ],
            moonSign: "Cancer",
            sunSign: "Leo",
            ayanamsa: 24.17,
            dasha: nil,
            derived: derived
        )
    }

    private var full: ChartFacts {
        ChartFacts(chart: chart(derived: DerivedFacts(
            planets: [venus],
            houses: [DerivedHouse(number: 7, sign: "Taurus", lord: "Venus",
                                  lordHouse: 7, occupants: ["Venus"])],
            dasha: []
        )))
    }

    private var bare: ChartFacts { ChartFacts(chart: chart(derived: nil)) }

    func testBodyRowNamesWhatItControlsWithoutAstrologyWords() throws {
        let row = try XCTUnwrap(full.body(named: "Venus"))
        XCTAssertTrue(row.contains("Controls sections 7, 12"), row)
        XCTAssertTrue(row.contains("Strength rating: highest"), row)
        XCTAssertTrue(row.contains("Linked to sections 1"), row)
    }

    func testNoForbiddenVocabularyReachesTheModel() throws {
        let row = try XCTUnwrap(full.body(named: "Venus")) + full.everything()
        for word in ["lord", "aspect", "exalt", "debilit", "house", "dosha", "planet", "astrolog"] {
            XCTAssertFalse(row.lowercased().contains(word), "leaked \(word): \(row)")
        }
    }

    func testSectionRowNamesItsController() throws {
        let row = try XCTUnwrap(full.section(7))
        XCTAssertTrue(row.contains("controlled by Venus"), row)
    }

    func testEveryRowFallsBackWhenTheServerSentNoDerivedBlock() throws {
        let row = try XCTUnwrap(bare.body(named: "Venus"))
        XCTAssertTrue(row.contains("Venus"), row)
        XCTAssertFalse(row.contains("Controls"), row)
        XCTAssertNotNil(bare.section(7))
        XCTAssertFalse(bare.everything().isEmpty)
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `xcodebuild -project mobile/Sanchara.xcodeproj -scheme Sanchara -destination 'platform=iOS Simulator,name=iPhone 16' test -only-testing:SancharaTests/ChartFactsTests`
Expected: FAIL — the rows carry none of the new text.

- [ ] **Step 3: Extend the rows**

In `mobile/Sanchara/Sources/Features/Chat/ChartFacts.swift`, add the vocabulary helper:

```swift
    /// The derived facts, stated without a single word the on-device model
    /// reads as fortune telling. See the note at the top of this file: framing
    /// is what decides whether the model answers or refuses.
    private static func strengthWord(_ dignity: String) -> String {
        switch dignity {
        case "exalted": "highest"
        case "debilitated": "lowest"
        case "moolatrikona", "own": "high"
        default: "standard"
        }
    }

    private func extras(for name: String) -> [String] {
        guard let d = chart.derived?.planet(named: name) else { return [] }
        var parts: [String] = []
        if !d.rules.isEmpty {
            parts.append("Controls sections \(d.rules.map(String.init).joined(separator: ", "))")
        }
        parts.append("Strength rating: \(Self.strengthWord(d.dignity))")
        if d.combust, let gap = d.fromSun {
            parts.append("Within \(String(format: "%.0f", gap)) degrees of Sun")
        }
        if !d.aspects.isEmpty {
            parts.append("Linked to sections \(d.aspects.map(String.init).joined(separator: ", "))")
        }
        if !d.conjunct.isEmpty {
            parts.append("Filed alongside \(d.conjunct.joined(separator: ", "))")
        }
        return parts
    }
```

In `body(named:)`, the existing line builds `"\(planet.name): position ... section \(planet.house)"`. Append the extras before returning:

```swift
        let tail = extras(for: planet.name)
        return tail.isEmpty ? line + "." : line + ". " + tail.joined(separator: ". ") + "."
```

Note the existing code says `section \(planet.house)`. Leave that reading the stored `house` — after Phase 1 it is whole-sign and agrees with the derived block.

In `section(_:)`, append the controller after the existing head:

```swift
        var head = "Section \(number) holds \(house.rashi.english) (\(house.rashi.sanskrit)), position \(house.rashi.number) of 12."
        if let d = chart.derived?.house(number) {
            head += " Controlled by \(d.lord), which is filed in section \(d.lordHouse)."
        }
```

In `currentPeriod()`, append the lords' placements when derived is present:

```swift
        var text = """
            Current major period: ...
            """
        for period in chart.derived?.dasha ?? [] {
            guard let p = period.placement else { continue }
            var line = " Entry \(period.lord) is filed in section \(p.house)"
            if !p.rules.isEmpty {
                line += ", controlling sections \(p.rules.map(String.init).joined(separator: ", "))"
            }
            text += line + "."
        }
        return text
```

- [ ] **Step 4: Run the tests**

Run: `xcodebuild -project mobile/Sanchara.xcodeproj -scheme Sanchara -destination 'platform=iOS Simulator,name=iPhone 16' test -only-testing:SancharaTests/ChartFactsTests`
Expected: PASS, including `testNoForbiddenVocabularyReachesTheModel`.

- [ ] **Step 5: Commit**

```bash
git add mobile/Sanchara/Sources/Features/Chat/ChartFacts.swift mobile/Sanchara/Tests/ChartFactsTests.swift
git commit -m "feat(ios): the on-device table carries controllers, links and strength"
```

---

### Task 14: Route the questions the new rows can answer

**Files:**
- Modify: `mobile/Sanchara/Sources/Features/Chat/OnDeviceReasoner.swift:63-70`
- Modify: `mobile/Sanchara/Tests/OnDeviceRoutingTests.swift`

**Interfaces:**
- Consumes: nothing.
- Produces: no new API; `mentionsTheTable` recognises more questions.

Without this, the rows from Task 13 are unreachable: "who rules my 7th house" names no body and no period word, so the cheap filter rejects it before the model runs.

- [ ] **Step 1: Write the failing test**

Append to `mobile/Sanchara/Tests/OnDeviceRoutingTests.swift`:

```swift
    func testDerivedVocabularyReachesTheTable() {
        let questions = [
            "who is the lord of my 7th",
            "which planet rules my 10th house",
            "is my Venus exalted",
            "is anything debilitated in my chart",
            "is my Mercury combust",
            "what does my Saturn aspect",
        ]
        for question in questions {
            XCTAssertTrue(
                OnDeviceReasoner.mentionsTheTable(question),
                "should reach the table: \(question)"
            )
        }
    }

    func testInterpretiveQuestionsStillDoNotReachTheTable() {
        for question in ["should I take the job", "will I be happy this year"] {
            XCTAssertFalse(OnDeviceReasoner.mentionsTheTable(question), question)
        }
    }
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `xcodebuild -project mobile/Sanchara.xcodeproj -scheme Sanchara -destination 'platform=iOS Simulator,name=iPhone 16' test -only-testing:SancharaTests/OnDeviceRoutingTests`
Expected: FAIL — "who is the lord of my 7th" is rejected.

- [ ] **Step 3: Extend the filter**

In `OnDeviceReasoner.mentionsTheTable`, extend the word list:

```swift
        let periodWords = ["dasha", "mahadasha", "antardasha", "period", "lagna", "ascendant",
                           "rising", "nakshatra", "moon sign", "sun sign", "rashi",
                           // Words the derived rows can answer from. Without these the
                           // richer table is unreachable: "who rules my 7th" names no
                           // body, so the cheap filter would reject it before the model runs.
                           "lord", "ruler", "rules", "aspect", "exalted", "debilitated",
                           "combust", "strength"]
```

Note `sectionNumber(in:)` already matches "7th", so "who is the lord of my 7th" would pass on the number alone; the words matter for "which planet rules my chart" and for questions naming no number.

- [ ] **Step 4: Run the tests**

Run: `xcodebuild -project mobile/Sanchara.xcodeproj -scheme Sanchara -destination 'platform=iOS Simulator,name=iPhone 16' test -only-testing:SancharaTests/OnDeviceRoutingTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/Sanchara/Sources/Features/Chat/OnDeviceReasoner.swift mobile/Sanchara/Tests/OnDeviceRoutingTests.swift
git commit -m "feat(ios): route lord, aspect and strength questions to the device"
```

---

### Task 15: The release gate — verify the real model still answers

**Files:** none. This task produces a written result, not a commit of code.

**Interfaces:**
- Consumes: Tasks 12-14.
- Produces: a go/no-go on shipping Phase 4.

**Why this cannot be a unit test.** `SuggestionEngine.isOnDeviceAvailable` is false on CI and on any machine without Apple Intelligence, and the model's answers are not deterministic in any case. The existing neutral framing in `ChartFacts.swift` was arrived at by testing against the real model, and its own comments say so. Adding a dozen row types is exactly the change that can trip the guardrail back into refusing.

- [ ] **Step 1: Build to a physical device with Apple Intelligence enabled**

Confirm on the profile screen that `SuggestionEngine.onDeviceStatus` reads "On, generating suggestions on this device". Any other status means the gate cannot be run on this device.

- [ ] **Step 2: Ask one question per new row type, in Vedic mode**

Ask each, and record the answer verbatim:

1. "who is the lord of my 7th house"
2. "which planet rules my 10th"
3. "is my Venus exalted"
4. "is my Mercury combust"
5. "what does my Saturn aspect"
6. "which dasha am I in and where is its lord"

- [ ] **Step 3: Check each answer against three conditions**

- It was answered **on device** — the transcript labels it, and `ChatStore.canExpandLastAnswer` is true.
- It was not refused. A refusal reads as "May contain sensitive content" or a flat decline.
- It restates the table rather than interpreting it.

- [ ] **Step 4: Decide**

All six pass: Phase 4 ships.

Any refusal: the vocabulary in Task 13 has not gone far enough. Find the word that triggered it, replace it with a plainer one, and repeat from Step 2. Do **not** loosen the guardrails further — `permissiveContentTransformations` is already in use and there is nothing above it.

Any answer that interprets rather than restates: the instructions in `OnDeviceReasoner.answer` need the restatement rule sharpened. That is a prompt change in that file, not a change to the table.

- [ ] **Step 5: Record the result**

Append the six questions and their verbatim answers to `docs/SIRI_AND_WIDGETS.md`, under a new heading "On-device lookups, verified against the model". This is how the next person learns what the model actually accepts, which is the thing the code comments say was expensive to find.

```bash
git add docs/SIRI_AND_WIDGETS.md
git commit -m "docs: record what the on-device model accepts from the derived table"
```

---

## Self-review

**Spec coverage.** §0 whole-sign → Task 2. §1 derived module → Tasks 3-4, storage in Task 5. §2 gochara → Task 7. §3 prompt → Task 8, route wiring Task 9. §4 numerology → Tasks 10-11. §5 on device → Tasks 12-14. §6 testing → folded into each task, with the manual gate as Task 15. §7 rollout → Task 5 (lazy upgrade) and Task 6 (alert suppression). §8 out of scope → the Global Constraints section.

**One deliberate deviation from the spec.** §7 proposed a `chart.schemaVersion` marker plus a `last_reconciled_version` per user to suppress false alerts once. Task 6 does it without either: a natal condition is fixed at birth, so a change in one is always an artifact and never an event, and the only question is whether the user has natal rows yet. `schemaVersion` is still added in Task 2, but only to decide whether a stored chart needs rewriting — not to gate alerts. This is simpler, needs no stored state, and stays correct for any future computation change.

**Ordering note.** Task 6 must land before Task 5 reaches production, or the first upgraded chart triggers the false pushes it exists to prevent. Within this plan Task 5 precedes Task 6, which is safe only because nothing is deployed mid-plan. If Phase 1 is deployed in pieces, deploy Task 6 first.
