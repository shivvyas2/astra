import { NAKSHATRAS, SIGNS, houseFrom, signIndex } from "@/lib/astrology/constants";
import type { Chart } from "@/lib/astrology/types";

/**
 * Ashta Koota Guna Milan: the 36-point match read from two Moons.
 *
 * Convention. The tables below are the common North Indian ones, as printed
 * in most panchangas and reproduced by onlinejyotish.com's marriage-matching
 * articles (https://www.onlinejyotish.com/articles/marriage-matching/english/):
 *
 * - Varna (1): from the Moon's rashi by element — water Brahmin, fire
 *   Kshatriya, earth Vaishya, air Shudra. 1 when the groom's varna is the
 *   same as or above the bride's.
 * - Vashya (2): the rashi's creature group, with Sagittarius and Capricorn
 *   split at 15° (Sagittarius: human, then quadruped; Capricorn: quadruped,
 *   then water). The 5×5 table is onlinejyotish's (bride rows, groom columns).
 * - Tara (3): counted both ways, bride→groom and groom→bride, inclusive;
 *   each count mod 9 of 3, 5 or 7 (Vipat, Pratyari, Vadha) scores 0, any
 *   other 1.5.
 * - Yoni (4): the fourteen animals and the standard symmetric 14×14 table
 *   (sworn enemies — horse/buffalo, elephant/lion, sheep/monkey,
 *   serpent/mongoose, dog/deer, cat/rat, cow/tiger — score 0).
 * - Graha Maitri (5): from the natural friendships of the two rashi lords:
 *   friend+friend 5, friend+neutral 4, neutral+neutral 3, friend+enemy 1,
 *   neutral+enemy ½, enemy+enemy 0; the same lord 5. This reproduces the
 *   printed 7×7 table cell for cell.
 * - Gana (6): onlinejyotish's table (bride rows, groom columns):
 *   Deva bride — 6/6/0 with a Deva/Manushya/Rakshasa groom; Manushya bride —
 *   5/6/0; Rakshasa bride — 1/0/6.
 * - Bhakoot (7): 0 when the Moon signs are 2/12, 5/9 or 6/8 from each other.
 * - Nadi (8): 0 when both nakshatras share a nadi (Adi, Madhya, Antya).
 *
 * Published calculators disagree on a handful of cells (Vashya's
 * Vanachara/Keeta row, Gana's Deva–Manushya direction, a few Yoni pairs), so
 * totals from different sites can differ by a point or two for the same pair.
 * Where a koota is not symmetric the result depends on which chart is read as
 * the groom's; `computeAshtakoot` takes the roles explicitly and the API
 * reports the total both ways.
 *
 * Doshas and their cancellations are reported as notes and never change the
 * score: the tradition is divided on which exceptions apply, and a silent
 * override would hide that.
 */

export type MoonPoint = {
  /** English sign name, as the chart stores it. */
  sign: string;
  nakshatra: string;
  /** Degrees into the sign (sidereal). Used for the Vashya split and the pada. */
  degree?: number;
  /** False when the birth time is unknown: the degree, and so the pada, is a noon guess. */
  degreeKnown?: boolean;
};

export type KootaKey = "varna" | "vashya" | "tara" | "yoni" | "maitri" | "gana" | "bhakoot" | "nadi";

export type Koota = {
  key: KootaKey;
  name: string;
  score: number;
  max: number;
  /** The groom's and bride's category for this koota: "Kshatriya", "Deer", "Mars". */
  groom: string;
  bride: string;
  note: string;
};

export type DoshaNote = {
  kind: "nadi" | "bhakoot" | "mangal";
  present: boolean;
  /** Classical exceptions that apply to this pair. Reported, never applied to the score. */
  exceptions: string[];
  note: string;
};

export type Ashtakoot = {
  total: number;
  max: 36;
  kootas: Koota[];
  doshas: DoshaNote[];
};

// --- Tables -----------------------------------------------------------------

const VARNA = ["Brahmin", "Kshatriya", "Vaishya", "Shudra"] as const;
/** Higher is the more senior varna. */
const VARNA_RANK: Record<(typeof VARNA)[number], number> = { Brahmin: 4, Kshatriya: 3, Vaishya: 2, Shudra: 1 };

/** Indexed by sign: fire Kshatriya, earth Vaishya, air Shudra, water Brahmin. */
const SIGN_VARNA: (typeof VARNA)[number][] = [
  "Kshatriya", "Vaishya", "Shudra", "Brahmin", "Kshatriya", "Vaishya",
  "Shudra", "Brahmin", "Kshatriya", "Vaishya", "Shudra", "Brahmin",
];

const VASHYA = ["Chatushpada", "Manava", "Jalachara", "Vanachara", "Keeta"] as const;
type Vashya = (typeof VASHYA)[number];

/** onlinejyotish.com, Vashya Kootam: rows are the bride's group, columns the groom's. */
const VASHYA_TABLE: number[][] = [
  [2, 1, 1, 0, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0, 0, 1, 2, 0],
  [1, 0, 1, 0, 2],
];

const YONI = [
  "Horse", "Elephant", "Sheep", "Serpent", "Dog", "Cat", "Rat",
  "Cow", "Buffalo", "Tiger", "Deer", "Monkey", "Mongoose", "Lion",
] as const;

/** The yoni of each nakshatra, Ashwini to Revati. */
const NAKSHATRA_YONI: number[] = [
  0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1,
];

/** Standard symmetric Yoni table, in the order of YONI. */
const YONI_TABLE: number[][] = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 1, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [1, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

const GANA = ["Deva", "Manushya", "Rakshasa"] as const;
/** Deva 0, Manushya 1, Rakshasa 2 — Ashwini to Revati. */
const NAKSHATRA_GANA: number[] = [
  0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0,
];
/** onlinejyotish.com, Gana Kootam: rows are the bride's gana, columns the groom's. */
const GANA_TABLE: number[][] = [
  [6, 6, 0],
  [5, 6, 0],
  [1, 0, 6],
];

const NADI = ["Adi", "Madhya", "Antya"] as const;
/** The nadis run Adi, Madhya, Antya, Antya, Madhya, Adi … through the 27. */
function nadiOf(nakshatraIndex: number): number {
  return [0, 1, 2, 2, 1, 0][nakshatraIndex % 6];
}

/** Lord of each sign, Aries to Pisces. */
export const SIGN_LORD = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
] as const;

type Relation = "friend" | "neutral" | "enemy";

/** Naisargika (natural) friendships, Parashara: how the row planet regards the others. */
const NATURAL: Record<string, Record<string, Relation>> = {
  Sun: { Moon: "friend", Mars: "friend", Jupiter: "friend", Mercury: "neutral", Venus: "enemy", Saturn: "enemy" },
  Moon: { Sun: "friend", Mercury: "friend", Mars: "neutral", Jupiter: "neutral", Venus: "neutral", Saturn: "neutral" },
  Mars: { Sun: "friend", Moon: "friend", Jupiter: "friend", Venus: "neutral", Saturn: "neutral", Mercury: "enemy" },
  Mercury: { Sun: "friend", Venus: "friend", Mars: "neutral", Jupiter: "neutral", Saturn: "neutral", Moon: "enemy" },
  Jupiter: { Sun: "friend", Moon: "friend", Mars: "friend", Saturn: "neutral", Mercury: "enemy", Venus: "enemy" },
  Venus: { Mercury: "friend", Saturn: "friend", Mars: "neutral", Jupiter: "neutral", Sun: "enemy", Moon: "enemy" },
  Saturn: { Mercury: "friend", Venus: "friend", Jupiter: "neutral", Sun: "enemy", Moon: "enemy", Mars: "enemy" },
};

export function naturalRelation(of: string, toward: string): Relation | "same" {
  if (of === toward) return "same";
  return NATURAL[of]?.[toward] ?? "neutral";
}

/** The Graha Maitri points for two rashi lords. Symmetric. */
export function maitriPoints(a: string, b: string): number {
  if (a === b) return 5;
  const pair = [naturalRelation(a, b), naturalRelation(b, a)].sort().join("+");
  switch (pair) {
    case "friend+friend": return 5;
    case "friend+neutral": return 4;
    case "neutral+neutral": return 3;
    case "enemy+friend": return 1;
    case "enemy+neutral": return 0.5;
    default: return 0; // enemy+enemy
  }
}

// --- Classification -----------------------------------------------------------

function nakIndex(name: string): number {
  const i = NAKSHATRAS.indexOf(name as (typeof NAKSHATRAS)[number]);
  if (i < 0) throw new Error(`Unknown nakshatra: ${name}`);
  return i;
}

function sIndex(sign: string): number {
  const i = signIndex(sign);
  if (i < 0) throw new Error(`Unknown sign: ${sign}`);
  return i;
}

export function vashyaOf(moon: MoonPoint): Vashya {
  const s = sIndex(moon.sign);
  const firstHalf = (moon.degree ?? 0) < 15;
  switch (s) {
    case 0: case 1: return "Chatushpada";
    case 2: case 5: case 6: case 10: return "Manava";
    case 3: case 11: return "Jalachara";
    case 4: return "Vanachara";
    case 7: return "Keeta";
    case 8: return firstHalf ? "Manava" : "Chatushpada";
    default: return firstHalf ? "Chatushpada" : "Jalachara"; // Capricorn
  }
}

/** 1–4: which quarter of its nakshatra the Moon is in. Undefined without a degree. */
export function padaOf(moon: MoonPoint): number | undefined {
  if (moon.degree === undefined) return undefined;
  const lon = sIndex(moon.sign) * 30 + moon.degree;
  const span = 360 / 27;
  return Math.min(4, Math.floor((lon % span) / (span / 4)) + 1);
}

/** Inclusive count from one nakshatra to another, 1–27. */
function countStars(from: number, to: number): number {
  return ((to - from + 27) % 27) + 1;
}

const TARA_NAMES = ["Ati-Mitra", "Janma", "Sampat", "Vipat", "Kshema", "Pratyari", "Sadhaka", "Vadha", "Mitra"];

function taraHalf(from: number, to: number): { points: number; name: string } {
  const r = countStars(from, to) % 9;
  return { points: [3, 5, 7].includes(r) ? 0 : 1.5, name: TARA_NAMES[r] };
}

// --- The match -------------------------------------------------------------------

/**
 * Scores the eight kootas. Throws on a nakshatra or sign name it does not
 * know — every caller passes the chart's own names, so that is a bug, not
 * input.
 */
export function computeAshtakoot(args: { groom: MoonPoint; bride: MoonPoint }): Ashtakoot {
  const { groom, bride } = args;
  const gs = sIndex(groom.sign);
  const bs = sIndex(bride.sign);
  const gn = nakIndex(groom.nakshatra);
  const bn = nakIndex(bride.nakshatra);

  const gVarna = SIGN_VARNA[gs];
  const bVarna = SIGN_VARNA[bs];
  const varna = VARNA_RANK[gVarna] >= VARNA_RANK[bVarna] ? 1 : 0;

  const gVashya = vashyaOf(groom);
  const bVashya = vashyaOf(bride);
  const vashya = VASHYA_TABLE[VASHYA.indexOf(bVashya)][VASHYA.indexOf(gVashya)];

  const fromBride = taraHalf(bn, gn);
  const fromGroom = taraHalf(gn, bn);
  const tara = fromBride.points + fromGroom.points;

  const gYoni = NAKSHATRA_YONI[gn];
  const bYoni = NAKSHATRA_YONI[bn];
  const yoni = YONI_TABLE[gYoni][bYoni];

  const gLord = SIGN_LORD[gs];
  const bLord = SIGN_LORD[bs];
  const maitri = maitriPoints(gLord, bLord);

  const gGana = NAKSHATRA_GANA[gn];
  const bGana = NAKSHATRA_GANA[bn];
  const gana = GANA_TABLE[bGana][gGana];

  const apart = houseFrom(groom.sign, bride.sign);
  const pairing = Math.min(apart, houseFrom(bride.sign, groom.sign));
  const bhakootDosha = [2, 12, 5, 9, 6, 8].includes(apart);
  const bhakoot = bhakootDosha ? 0 : 7;

  const gNadi = nadiOf(gn);
  const bNadi = nadiOf(bn);
  const nadiDosha = gNadi === bNadi;
  const nadi = nadiDosha ? 0 : 8;

  const pairName = (n: number) => (n === 1 ? "the same sign" : `${n}/${14 - n}`);

  const kootas: Koota[] = [
    {
      key: "varna", name: "Varna", score: varna, max: 1, groom: gVarna, bride: bVarna,
      note: varna ? "Temperaments sit well together." : "The groom's varna is below the bride's.",
    },
    {
      key: "vashya", name: "Vashya", score: vashya, max: 2, groom: gVashya, bride: bVashya,
      note: vashya === 2 ? "The same group: easy mutual influence." : vashya === 0 ? "Groups that do not yield to each other." : "Partial mutual influence.",
    },
    {
      key: "tara", name: "Tara", score: tara, max: 3, groom: fromGroom.name, bride: fromBride.name,
      note: tara === 3 ? "Both counts land on kind stars." : tara === 0 ? "Both counts land on hard stars." : "One count lands on a hard star.",
    },
    {
      key: "yoni", name: "Yoni", score: yoni, max: 4, groom: YONI[gYoni], bride: YONI[bYoni],
      note: yoni === 4 ? "The same animal." : yoni === 0 ? "Sworn-enemy animals." : yoni >= 3 ? "Friendly animals." : "Neutral animals.",
    },
    {
      key: "maitri", name: "Graha Maitri", score: maitri, max: 5, groom: gLord, bride: bLord,
      note: gLord === bLord ? `Both Moon signs are ruled by ${gLord}.` : `${gLord} and ${bLord} are ${maitri >= 4 ? "friendly" : maitri >= 3 ? "neutral" : "uneasy"} toward each other.`,
    },
    {
      key: "gana", name: "Gana", score: gana, max: 6, groom: GANA[gGana], bride: GANA[bGana],
      note: gana === 6 ? "Matching temperaments." : gana === 0 ? "Clashing temperaments." : "Workable temperaments.",
    },
    {
      key: "bhakoot", name: "Bhakoot", score: bhakoot, max: 7, groom: SIGNS[gs], bride: SIGNS[bs],
      note: bhakootDosha
        ? `Moon signs ${pairName(pairing)} apart: Bhakoot dosha.`
        : pairing === 1
          ? "Both Moons in the same sign."
          : `Moon signs ${pairName(pairing)} apart.`,
    },
    {
      key: "nadi", name: "Nadi", score: nadi, max: 8, groom: NADI[gNadi], bride: NADI[bNadi],
      note: nadiDosha ? `Both ${NADI[gNadi]} nadi: Nadi dosha.` : "Different nadis.",
    },
  ];

  const doshas: DoshaNote[] = [];
  if (nadiDosha) {
    const exceptions: string[] = [];
    if (gs === bs && gn !== bn) exceptions.push("Same Moon sign, different nakshatras.");
    if (gn === bn && gs !== bs) exceptions.push("Same nakshatra falling in different Moon signs.");
    const gp = groom.degreeKnown === false ? undefined : padaOf(groom);
    const bp = bride.degreeKnown === false ? undefined : padaOf(bride);
    if (gn === bn && gs === bs && gp !== undefined && bp !== undefined && gp !== bp) {
      exceptions.push("Same nakshatra, different padas.");
    }
    if (gLord === bLord) exceptions.push(`Both Moon signs ruled by ${gLord}.`);
    doshas.push({
      kind: "nadi",
      present: true,
      exceptions,
      note:
        "Both Moons share a nadi, which the tradition reads as a concern for health and children." +
        (exceptions.length > 0 ? " Some texts lift it in this case; the score is shown without that relief." : ""),
    });
  }
  if (bhakootDosha) {
    const exceptions: string[] = [];
    if (gLord === bLord) exceptions.push(`Both Moon signs ruled by ${gLord}.`);
    else if (naturalRelation(gLord, bLord) === "friend" && naturalRelation(bLord, gLord) === "friend") {
      exceptions.push(`${gLord} and ${bLord}, the Moon-sign lords, are natural friends.`);
    }
    if (!nadiDosha) exceptions.push("The nadis differ.");
    doshas.push({
      kind: "bhakoot",
      present: true,
      exceptions,
      note:
        `The Moon signs are ${pairName(pairing)} apart, which the tradition reads as friction over money or closeness.` +
        (exceptions.length > 0 ? " Some texts lift it in this case; the score is shown without that relief." : ""),
    });
  }

  const total = kootas.reduce((n, k) => n + k.score, 0);
  return { total, max: 36, kootas, doshas };
}

// --- Mangal dosha --------------------------------------------------------------

const MANGAL_HOUSES = [1, 2, 4, 7, 8, 12];

export type MangalResult = {
  /** Null when the birth time is unknown and the ascendant cannot be trusted. */
  fromLagna: boolean | null;
  fromMoon: boolean;
  /** Present by either reckoning that could be checked. */
  present: boolean;
};

/**
 * Mars in the 1st, 2nd, 4th, 7th, 8th or 12th, counted from the lagna and
 * from the Moon (whole-sign). The lagna check is skipped for a chart whose
 * birth time is unknown.
 */
export function mangalDosha(chart: Chart): MangalResult {
  const mars = chart.planets.find((p) => p.name === "Mars");
  const moon = chart.planets.find((p) => p.name === "Moon");
  if (!mars) return { fromLagna: null, fromMoon: false, present: false };
  const fromLagna = chart.timeKnown === false ? null : MANGAL_HOUSES.includes(houseFrom(chart.ascendant.sign, mars.sign));
  const fromMoon = MANGAL_HOUSES.includes(houseFrom(moon?.sign ?? chart.moonSign, mars.sign));
  return { fromLagna, fromMoon, present: fromLagna === true || fromMoon };
}

/** The Mangal-dosha note for a pair, comparing both people. */
export function mangalNote(a: MangalResult, b: MangalResult, names: { a: string; b: string }): DoshaNote {
  const describe = (m: MangalResult) => {
    const where = [m.fromLagna ? "the ascendant" : "", m.fromMoon ? "the Moon" : ""].filter(Boolean).join(" and ");
    return where ? `Mars is in a Mangal house from ${where}` : "no Mangal dosha";
  };
  const unchecked = [a.fromLagna === null ? names.a : "", b.fromLagna === null ? names.b : ""].filter(Boolean);
  const caveat =
    unchecked.length > 0 ? ` Only the Moon was checked for ${unchecked.join(" and ")}, without a birth time.` : "";
  if (a.present && b.present) {
    return {
      kind: "mangal",
      present: true,
      exceptions: ["Both charts carry it, which most texts treat as cancelling out."],
      note: `${names.a}: ${describe(a)}. ${names.b}: ${describe(b)}.${caveat}`,
    };
  }
  if (a.present || b.present) {
    return {
      kind: "mangal",
      present: true,
      exceptions: [],
      note: `${a.present ? names.a : names.b} has Mangal dosha (${describe(a.present ? a : b)}); ${a.present ? names.b : names.a} does not.${caveat}`,
    };
  }
  return { kind: "mangal", present: false, exceptions: [], note: `Neither chart has Mangal dosha.${caveat}` };
}

/** The Moon of a Vedic chart as `computeAshtakoot` wants it. */
export function moonPointOf(chart: Chart): MoonPoint {
  const moon = chart.planets.find((p) => p.name === "Moon");
  if (!moon?.nakshatra) throw new Error("chart has no Moon nakshatra");
  return { sign: moon.sign, nakshatra: moon.nakshatra, degree: moon.degree, degreeKnown: chart.timeKnown !== false };
}

/** The traditional reading of a total. */
export function gunaVerdict(total: number): string {
  if (total < 18) return "Below the traditional 18-point threshold";
  if (total <= 24) return "An acceptable match";
  if (total <= 32) return "A very good match";
  return "An excellent match";
}
