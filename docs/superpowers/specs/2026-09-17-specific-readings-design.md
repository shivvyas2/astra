# Specific readings: derived chart facts, whole-sign houses, gochara — Design Spec

**Date:** 2026-09-17
**Status:** Draft, awaiting review

## Summary

Sanchara's readings are general because its inputs are general. The model is
handed nine planet lines, a lagna, and a flat list of which sign each transiting
planet is in. It has no house lords, no aspects, no dignity, no idea where the
dasha lord actually sits, and no sight of the seventeen conditions
`lib/astrology/doshas.ts` already detects. A model given sign-level facts writes
sign-level prose; the instructions have said "never a generic horoscope" all
along and cannot fix an input problem.

This spec adds a derived-facts layer computed once per chart, feeds it to every
consumer — web chat, the on-device model, numerology — and tightens the output
rules so a claim without a named placement, house, and technique is not allowed.

Depth is **core Parashari**: lords, drishti, dignity, combustion, dasha lord
placement, gochara. No divisional charts, no Shadbala, no Ashtakavarga.

Principle, unchanged from the existing design: the server computes, the phone
renders, and the on-device model only ever restates records.

## 0. Prerequisite: Vedic houses become whole-sign

### The bug this fixes

`lib/astrology/chart.ts:88` computes every planet's `house` from Placidus cusps
(`houses_ex(jd, iflag, lat, lng, "P")`), for Vedic as well as Western.
`ChartData.swift:206` builds the kundli whole-sign — house 1 holds the lagna's
rashi, each following house the next sign — and then fills those houses with
`planets.filter { $0.house == number }`, the Placidus number. The label and the
contents therefore disagree: a planet can be drawn inside a house marked with a
sign it is not in.

`lib/pdf/kundli.ts:290` has the same split: it numbers each house's rashi
whole-sign (`(ascIndex + house - 1) % 12`) and fills it from the Placidus
`house` field. So the printed kundli carries the bug too, and the fix corrects
all three renderings at once.

Placidus also permits two houses carrying the same sign and one sign appearing
in none, which leaves "the lord of the 7th" undefined. Every technique in this
spec rests on lordship, so this must be settled first.

### The change

In `computeChart`, when `tradition === "vedic"`, the house of a longitude is

    ((signIndex(longitude) - signIndex(ascendantSign) + 12) % 12) + 1

Western continues to use `houseOf(lon, cusps)` unchanged — Placidus is correct
for that tradition. `chart.houses` keeps the Placidus cusps in both cases; it is
referenced only by `lib/astrology/chart.test.ts:16` and is not decoded by the
iOS app at all, so nothing renders from it. The ascendant degree still comes
from `ascmc[0]`, so the lagna printed on the kundli is unaffected.

### Consequence, stated plainly

Existing users' charts change when next computed. A planet in the lagna's sign
at a degree below the lagna's moves from house 12 to house 1; similar shifts
occur throughout. Charts already stored in `birth_profiles.chart` keep their old
numbers until rewritten, which is the same trigger as the derived block below —
so a chart corrects wholly or not at all, never half.

This is a visible change to something users have already seen. Whether to
surface it in-app is a product decision, not a technical one, and is out of
scope here.

## 1. `lib/astrology/derived.ts`

A pure module: no I/O, no network, no database. `deriveFacts(chart: Chart):
Derived`. Testable on any machine, exactly as `ChartFacts.swift` is.

### Types

```ts
export type Dignity = "exalted" | "debilitated" | "moolatrikona" | "own" | "neutral";

export type PlanetFact = {
  name: string;
  sign: string;
  degree: number;
  house: number;
  nakshatra?: string;
  retrograde: boolean;
  /** Houses this planet owns, whole-sign from the lagna. Empty for the nodes. */
  rules: number[];
  dignity: Dignity;
  /** Degrees from exact exaltation or debilitation, when in that sign. */
  fromDeepPoint?: number;
  combust: boolean;
  /** Degrees from the Sun, for everything but the Sun. */
  fromSun?: number;
  /** Houses this planet aspects by graha drishti. */
  aspects: number[];
  /** Planets standing in those houses. */
  aspectsPlanets: string[];
  /** Planets in the same house. */
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
  /** The lord's own natal placement. Absent when the lord is not a body in the chart. */
  placement?: PlanetFact;
};

export type Derived = {
  planets: PlanetFact[];
  houses: HouseFact[];
  dasha: DashaFact[];
  conditions: Condition[]; // from lib/astrology/doshas.ts
};
```

### Tables

**Rulership.** Aries Mars, Taurus Venus, Gemini Mercury, Cancer Moon, Leo Sun,
Virgo Mercury, Libra Venus, Scorpio Mars, Sagittarius Jupiter, Capricorn Saturn,
Aquarius Saturn, Pisces Jupiter.

Rahu and Ketu rule nothing. The co-lordship convention (Rahu–Aquarius,
Ketu–Scorpio) is school-dependent, and adopting it would put a contested claim
into every reading for those signs. `rules` is `[]` for both.

**Exaltation and debilitation.** Sign-level, with the classical deep point
recorded so the prompt can say "within a degree of exact":

| Planet | Exalted | Deep | Debilitated |
| --- | --- | --- | --- |
| Sun | Aries | 10° | Libra |
| Moon | Taurus | 3° | Scorpio |
| Mars | Capricorn | 28° | Cancer |
| Mercury | Virgo | 15° | Pisces |
| Jupiter | Cancer | 5° | Capricorn |
| Venus | Pisces | 27° | Virgo |
| Saturn | Libra | 20° | Aries |

The nodes are omitted: their exaltation signs are not agreed between schools.

**Moolatrikona.** Sun Leo 0–20°, Moon Taurus 4–30°, Mars Aries 0–12°, Mercury
Virgo 16–20°, Jupiter Sagittarius 0–10°, Venus Libra 0–15°, Saturn Aquarius
0–20°.

**Own signs.** Sun Leo; Moon Cancer; Mars Aries and Scorpio; Mercury Gemini and
Virgo; Jupiter Sagittarius and Pisces; Venus Taurus and Libra; Saturn Capricorn
and Aquarius.

**Dignity precedence.** Exalted, then moolatrikona, then own, then debilitated,
then neutral. Mercury in Virgo is the one sign where all three of the first
three apply, and it resolves by degree: 0–15° exalted, 16–20° moolatrikona,
21–30° own. This is the standard reading and is encoded as an explicit case, not
as a fall-through, so it cannot silently change if the precedence order is
edited later.

**Combustion.** Angular distance from the Sun, taking the shorter arc:

| Planet | Direct | Retrograde |
| --- | --- | --- |
| Moon | 12° | — |
| Mars | 17° | 17° |
| Mercury | 14° | 12° |
| Jupiter | 11° | 11° |
| Venus | 10° | 8° |
| Saturn | 15° | 15° |

The nodes do not combust.

**Graha drishti.** Every planet aspects the 7th house from itself. Mars
additionally the 4th and 8th, Jupiter the 5th and 9th, Saturn the 3rd and 10th.

Rahu and Ketu aspect the 7th only. The school giving them the 5th and 9th is
left out for the same reason as node co-lordship.

**Friendship is deliberately absent.** Natural (naisargika) friendship alone
produces misleading "enemy sign" claims, because the classical judgement is
compound — natural plus temporal (tatkalika) — and temporal friendship must be
recomputed per chart. Including half of a two-part rule would make readings
confidently wrong rather than usefully specific. `Dignity` therefore stops at
five values. The natural friendship table does appear in this spec, but only for
numerology (§4), where it is the whole rule rather than half of one.

### Dasha facts

For both the mahadasha and the antardasha lord, `derived.dasha` carries that
lord's own `PlanetFact` — where it sits, what it rules, its dignity, what it
aspects. This is the single largest fix for generic dasha writing: "you are in
Jupiter mahadasha" becomes "Jupiter, which rules your 4th and 7th, sits in your
11th in Gemini".

Ketu and Rahu mahadashas carry a placement with `rules: []`, which is correct
and reads as such.

### Conditions

`detectNatalDoshas(chart)` from `lib/astrology/doshas.ts`, verbatim. Each
`Condition` already carries a `detail` written as a plain factual sentence — the
comment on that type calls it "the grounding the model is allowed to interpret",
which is exactly this use. Seventeen detectors currently reach only the daily
alerts job.

### Storage

`computeChart` calls `deriveFacts` and stores the result as `chart.derived`.

No SQL migration and no backfill script. Readers call `deriveFacts(chart)`
themselves when `chart.derived` is absent, so existing users get correct answers
on their next message, and the stored copy fills in whenever their chart is next
written. This keeps the outstanding 0006/0007 migrations untouched.

## 2. Gochara — `lib/astrology/transits.ts`

`describeTransits(chart)` today returns `"Saturn in Pisces, Jupiter in Gemini,
…"`: true of everyone alive on that date, and related to the person not at all.

It is replaced by `describeGochara(natal: Chart, transit: Chart): string`, which
for each transiting body gives:

- the house it occupies **from the natal lagna**;
- the house it occupies **from the natal Moon**, the classical gochara
  reference, which is what makes Sade Sati and the 4/8/12 transits legible;
- any natal planet it conjoins (same house) or aspects.

`detectTransitAfflictions(natal, transit)` — already written, already unused by
chat — is appended.

The output stays day-stable, because the transit chart is already computed once
per day per neighbourhood and sampled at midday UTC. It therefore remains in
`buildTodaySystem` and the prompt-cache behaviour described in
`docs/MODEL_COSTS.md` is unchanged.

## 3. Prompt — `lib/astrology/prompt.ts`

### Rendering

`renderChart(chart)` becomes `renderChartFacts(chart, derived)`, emitting four
blocks:

1. **Placements.** One line per planet, now carrying lordship, dignity,
   combustion and drishti:

       Saturn: Pisces 12°34', house 8, Uttara Bhadrapada
         rules houses 7, 8 · neutral · aspects houses 10, 2, 5 · with Mercury

2. **Houses.** One line per house: sign, lord, where the lord sits and in what
   dignity, occupants, and who aspects it.

3. **Period.** The current mahadasha and antardasha with their lords' own
   placements, as §1 describes.

4. **Standing conditions.** Each `Condition.label` with its `detail`.

`buildChartSystem` takes a `derived: Derived` argument, and
`buildTodaySystem`'s `transits` string is now the gochara text from §2.
`app/api/chat/route.ts` resolves `chart.derived ?? deriveFacts(chart)` once and
passes it to both, replacing its `describeTransits` call with
`describeGochara(natal, transit)`.

Roughly 400–600 tokens. All four blocks are functions of the chart alone, so
they sit inside `buildChartSystem`, behind the existing cache breakpoint, and
are billed at a tenth of the input rate from the second turn of a conversation
onward.

### Output rules

The accuracy section changes from "ground every claim in a named placement" to
something checkable:

- Every claim names the placement, its house, and the technique it reads by —
  lordship, aspect, dignity, dasha, or transit.
- Nothing outside the fact blocks may be asserted. This already held for
  positions; it now holds for lords, aspects and conditions too.
- No sign-personality writing. A sentence that would be true of a twelfth of the
  population is not an answer. Named and banned explicitly, because it is the
  exact failure being fixed.
- When the chart genuinely does not speak to the question, say so and say what
  it does show — unchanged, and more important now that the model has more
  material to be tempted by.

## 4. Numerology — `lib/astrology/numerology.ts`

Three bare numbers is why that mode reads generic. Three additions, all fixed
tables, all cheap:

- **Personal year and personal month**, from birth month and day against the
  current date. Both change, so they render in `buildTodaySystem`; personal
  month is stable for a month, so the cache is unaffected.
- **Lo Shu grid** — which digits the birth date repeats and which are missing.
  This is the most concrete thing numerology has: "three 1s and no 4" is
  specific in a way "your mulank is 5" can never be.
- **Number relationships** — whether namank supports or clashes with mulank,
  from the natural friendship of the planets ruling those numbers
  (1 Sun, 2 Moon, 3 Jupiter, 4 Rahu, 5 Mercury, 6 Venus, 7 Ketu, 8 Saturn,
  9 Mars).

The friendship table, for the seven bodies where it is unanimous:

| Planet | Friends | Neutral | Enemies |
| --- | --- | --- | --- |
| Sun | Moon, Mars, Jupiter | Mercury | Venus, Saturn |
| Moon | Sun, Mercury | Mars, Jupiter, Venus, Saturn | — |
| Mars | Sun, Moon, Jupiter | Venus, Saturn | Mercury |
| Mercury | Sun, Venus | Mars, Jupiter, Saturn | Moon |
| Jupiter | Sun, Moon, Mars | Saturn | Mercury, Venus |
| Venus | Mercury, Saturn | Mars, Jupiter | Sun, Moon |
| Saturn | Mercury, Venus | Jupiter | Sun, Moon, Mars |

Rahu (4) and Ketu (7) have no unanimous friendships. They are given Saturn's row
and Mercury's row respectively, which is the most common numerological practice,
and this substitution lives in one constant with a comment saying it is a
convention rather than a rule — so it can be corrected in one place.

## 5. On device — `ChartFacts.swift`, `OnDeviceReasoner.swift`

`NatalChart` gains an **optional** `derived: DerivedFacts?`, mirroring §1 field
for field as `ChartData.swift` already mirrors `types.ts`. Optional is
load-bearing twice: a chart cached in the app group before this ships still
decodes, and a user whose stored chart predates the change gets today's
behaviour rather than a decode failure in a widget or a Siri intent.

### Neutral vocabulary is a requirement, not a preference

`OnDeviceSuggestions.swift` records, from testing against the real model, that
Apple's on-device model refuses anything it reads as fortune telling, and
`ChartFacts.swift` is written in deliberately bare language for that reason —
"section", not "house". Derived terms need the same treatment or the enriched
table will start being refused where the thin one was not:

| Term | Row text |
| --- | --- |
| lord of the 7th | `Section 7 is controlled by Venus.` |
| aspects houses 10, 2, 5 | `Linked to sections 10, 2, 5.` |
| exalted / debilitated | `Strength rating: highest. / Strength rating: lowest.` |
| moolatrikona / own | `Strength rating: high.` |
| neutral | `Strength rating: standard.` |
| combust | `Within 4 degrees of Sun.` |
| dasha lord's placement | `Current period entry Jupiter is filed at Gemini 3°11', section 11.` |

### Conditions stay off the device

Doshas are interpretive flags, not records. The reasoner's contract is that it
restates what the tool returned and never interprets, enforced by discarding any
answer composed without a tool call. Putting "Sade Sati, peak phase" in the
table invites precisely the answer that guard exists to prevent. Condition
questions escalate to Claude, as they do today.

### Tool surface

No new `@Generable Arguments` fields. The existing `body`, `section`,
`currentPeriod` and `wholeTable` lookups return richer rows. A small argument
schema is what keeps constrained decoding reliable, and adding four more
optional fields to buy rows the existing four already reach would trade that
away for nothing.

`mentionsTheTable` gains trigger words so the new rows are reachable: lord,
lords, ruler, rules, aspect, aspects, exalted, debilitated, combust, strength.

When `derived` is nil, every row falls back to its current text.

## 6. Testing

Test-driven, per the normal workflow. The cases worth naming are the ones that
catch real errors rather than restate the tables:

**`lib/astrology/derived.test.ts`**
- A golden chart fixture with hand-checked lords, dignities and aspects.
- Exaltation boundaries: a planet at the exact deep degree, and one a degree off.
- Mercury in Virgo at 14°, 18° and 25° — the three-way precedence case.
- Combustion at the orb boundary, and **retrograde Mercury and Venus**, whose
  orbs differ from their direct ones. This is the easiest rule in the spec to
  implement wrongly and the hardest to notice.
- All four drishti patterns, and the nodes' 7th-only aspect.
- Whole-sign house wrap across 0° Aries.
- Nodes: `rules` is empty and `dignity` is neutral.

**`lib/astrology/chart.test.ts`**
- Vedic houses are whole-sign from the lagna; Western are still Placidus.
- A chart whose lagna is late in a sign — where the two systems disagree most.

**`lib/astrology/transits.test.ts`**
- House from lagna and house from Moon for a known transit.

**`lib/astrology/prompt.test.ts`**
- The rendered block carries lord, dignity and aspect lines.
- No planet name absent from the chart appears anywhere in the output.

**Swift**
- `OnDeviceRoutingTests`: the new trigger words route to a lookup.
- `ChartFactsTests`: neutral rendering, and every row's `derived == nil`
  fallback.

### The gate no test covers

Whether the real on-device model still cooperates with the enriched table cannot
be asserted in CI — the existing framing was found by testing against the actual
model on a real device, and adding a dozen row types is exactly the change that
can trip the guardrail back into "May contain sensitive content".

Before this ships: run the routing tests on a device with Apple Intelligence
enabled, with at least one lookup per new row type, and confirm none is refused.
A refusal means the vocabulary in §5 needs to go further, not that the feature
is broken. This is a release gate, recorded here so it is not assumed away.

## 7. Rollout

### The migration must not send false alerts

This is the one consequence that reaches users directly, and it is not obvious.

`detectNatalDoshas` reads `planet.house`. Mangal dosha, for instance, is Mars in
house 1, 2, 4, 7, 8 or 12 from the lagna (`lib/astrology/doshas.ts:71`), and its
signature embeds the number: `mangal_dosha:${mars.house}`. Moving Vedic charts
to whole-sign therefore changes which natal conditions are detected and what
their signatures are.

`lib/alerts/run.ts:134` diffs current signatures against the stored open rows
and treats anything unmatched as a condition **starting**, which sends a push.
Left alone, the first alerts run after a chart is rewritten would tell people
that Mangal Dosha has just begun — an alarming notification caused entirely by
us changing house systems, about a birth chart that has not changed since they
were born.

The guard: `computeChart` stamps `chart.schemaVersion`, incremented by this
work. The alerts run records the version it last reconciled for a user. When the
stored version is lower, natal-scope conditions are reconciled **silently** —
open rows closed or inserted to match, `last_reconciled_version` updated, no
alert emitted and no push sent. Transit-scope conditions are unaffected, since
they are recomputed daily against the live sky in any case.

This runs once per user. Nothing is suppressed afterwards.

### Everything else

- No SQL migration for the chart itself. `chart.derived` fills in lazily; absent means compute in
  process.
- Whole-sign house numbers change with the same write, so a chart is never
  partly migrated.
- The iOS app decodes `birth_profiles.chart` directly under existing RLS, so it
  picks up `derived` with no API change.
- `ChartCache` entries written before this ships decode fine, because `derived`
  is optional.
- The silent reconciliation needs somewhere to record the version it last
  handled per user. Whether that is a column on an existing alerts table or a
  small new one is an implementation-plan decision; it is one integer either
  way.

## 8. Out of scope

- Divisional charts (D9 Navamsa, D10 Dashamsa), Shadbala, Ashtakavarga.
- Temporal (tatkalika) friendship and compound dignity.
- Yoga detection beyond the seventeen conditions already in `doshas.ts`.
- Any in-app notice about changed house numbers — a product decision.
- Raising the `deep` mode word budget. More grounded facts may well justify it,
  but that should be judged against real answers after this lands, not guessed
  at now.
