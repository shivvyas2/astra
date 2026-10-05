import { SIGNS, signIndex } from "@/lib/astrology/constants";
import type { Chart } from "@/lib/astrology/types";

/**
 * Western synastry essentials: the aspects between two people's Sun, Moon,
 * Venus, Mars and Ascendant, and how their elements sit together.
 *
 * Positions are tropical, read from each person's stored Western chart. A
 * chart saved without one is converted from the Vedic (sidereal) chart by
 * adding back the Lahiri ayanamsa it was computed with — the same correction
 * the ephemeris applied in the other direction.
 *
 * Without a birth time the Ascendant is left out, and the Moon (which moves
 * about 13° a day) is used with its contacts flagged as uncertain and given
 * half weight.
 *
 * The 0–100 score is a plain weighted sum, deterministic and explainable:
 * start at 50, add each aspect's weight × value × tightness (scaled), add a
 * little for element harmony, clamp. It is a summary of the list beside it,
 * not a separate verdict.
 */

export type Body = "Sun" | "Moon" | "Venus" | "Mars" | "Ascendant";
export type AspectName = "conjunction" | "sextile" | "square" | "trine" | "opposition";
export type Tone = "harmonious" | "challenging" | "intense";
export type Element = "Fire" | "Earth" | "Air" | "Water";

export type SynastryAspect = {
  /** The first person's body. */
  a: Body;
  /** The second person's body. */
  b: Body;
  aspect: AspectName;
  /** Degrees from exact, one decimal. */
  orb: number;
  tone: Tone;
  /** True when either side is a Moon whose exact degree is unknown. */
  uncertain: boolean;
};

export type ElementPair = { label: string; a: Element; b: Element; relation: "same" | "compatible" | "mismatched" };

export type Synastry = {
  score0to100: number;
  aspects: SynastryAspect[];
  elements: {
    a: Record<Element, number>;
    b: Record<Element, number>;
    pairs: ElementPair[];
  };
};

const ASPECTS: { name: AspectName; angle: number; orb: number }[] = [
  { name: "conjunction", angle: 0, orb: 8 },
  { name: "sextile", angle: 60, orb: 4 },
  { name: "square", angle: 90, orb: 6 },
  { name: "trine", angle: 120, orb: 6 },
  { name: "opposition", angle: 180, orb: 8 },
];

const ELEMENTS: Element[] = ["Fire", "Earth", "Air", "Water"];

export function elementOf(sign: string): Element {
  const i = signIndex(sign);
  return ELEMENTS[((i % 4) + 4) % 4];
}

/** Fire feeds on Air, Earth holds Water. */
export function elementRelation(a: Element, b: Element): ElementPair["relation"] {
  if (a === b) return "same";
  const pair = [a, b].sort().join("+");
  return pair === "Air+Fire" || pair === "Earth+Water" ? "compatible" : "mismatched";
}

/** How much a contact between these two bodies matters in a relationship. */
function weight(a: Body, b: Body): number {
  const key = [a, b].sort().join("-");
  const table: Record<string, number> = {
    "Moon-Sun": 3,
    "Mars-Venus": 3,
    "Moon-Moon": 2.5,
    "Moon-Venus": 2.5,
    "Sun-Venus": 2,
    "Venus-Venus": 2,
    "Sun-Sun": 1.5,
    "Mars-Moon": 1.5,
    "Mars-Sun": 1.5,
    "Mars-Mars": 1,
    "Ascendant-Ascendant": 1,
  };
  return table[key] ?? (a === "Ascendant" || b === "Ascendant" ? 1.5 : 1);
}

function toneOf(aspect: AspectName, a: Body, b: Body): Tone {
  if (aspect === "trine" || aspect === "sextile") return "harmonious";
  if (aspect === "square" || aspect === "opposition") return "challenging";
  // A conjunction takes the colour of what meets: Mars with anything but
  // Venus is heat rather than ease.
  const hasMars = a === "Mars" || b === "Mars";
  const venusMars = (a === "Venus" && b === "Mars") || (a === "Mars" && b === "Venus");
  return hasMars && !venusMars ? "intense" : "harmonious";
}

function value(aspect: AspectName, tone: Tone): number {
  if (tone === "intense") return 0.3;
  switch (aspect) {
    case "trine": return 1;
    case "conjunction": return 1;
    case "sextile": return 0.7;
    case "square": return -0.8;
    default: return -0.4; // opposition: tension, but also pull
  }
}

/** Tropical absolute longitude of each body, or none for a body that cannot be trusted. */
export function tropicalPoints(chart: { vedic: Chart; western?: Chart | null }): Partial<Record<Body, number>> {
  const timeKnown = chart.vedic.timeKnown !== false;
  const western = chart.western ?? null;
  const out: Partial<Record<Body, number>> = {};
  const lonOf = (sign: string, degree: number) => signIndex(sign) * 30 + degree;
  const ayanamsa = chart.vedic.ayanamsa ?? 0;
  for (const name of ["Sun", "Moon", "Venus", "Mars"] as const) {
    if (western) {
      const p = western.planets.find((x) => x.name === name);
      if (p) out[name] = lonOf(p.sign, p.degree);
    } else {
      const p = chart.vedic.planets.find((x) => x.name === name);
      if (p) out[name] = (lonOf(p.sign, p.degree) + ayanamsa) % 360;
    }
  }
  if (timeKnown) {
    out.Ascendant = western
      ? lonOf(western.ascendant.sign, western.ascendant.degree)
      : (lonOf(chart.vedic.ascendant.sign, chart.vedic.ascendant.degree) + ayanamsa) % 360;
  }
  return out;
}

function signAt(lon: number): string {
  return SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];
}

/** The closest aspect between two longitudes within orb, if any. */
export function aspectBetween(lonA: number, lonB: number, a: Body, b: Body): { aspect: AspectName; orb: number } | null {
  const diff = Math.abs(lonA - lonB) % 360;
  const sep = diff > 180 ? 360 - diff : diff;
  const luminary = a === "Sun" || a === "Moon" || b === "Sun" || b === "Moon";
  let best: { aspect: AspectName; orb: number } | null = null;
  for (const asp of ASPECTS) {
    const allowed = asp.orb + (luminary ? (asp.name === "sextile" ? 1 : 2) : 0);
    const orb = Math.abs(sep - asp.angle);
    if (orb <= allowed && (!best || orb < best.orb)) best = { aspect: asp.name, orb };
  }
  return best;
}

export function computeSynastry(
  a: { vedic: Chart; western?: Chart | null },
  b: { vedic: Chart; western?: Chart | null },
): Synastry {
  const pa = tropicalPoints(a);
  const pb = tropicalPoints(b);
  const aMoonUncertain = a.vedic.timeKnown === false;
  const bMoonUncertain = b.vedic.timeKnown === false;

  const found: (SynastryAspect & { pull: number })[] = [];
  for (const [na, la] of Object.entries(pa) as [Body, number][]) {
    for (const [nb, lb] of Object.entries(pb) as [Body, number][]) {
      const hit = aspectBetween(la, lb, na, nb);
      if (!hit) continue;
      const tone = toneOf(hit.aspect, na, nb);
      const uncertain = (na === "Moon" && aMoonUncertain) || (nb === "Moon" && bMoonUncertain);
      const maxOrb = ASPECTS.find((x) => x.name === hit.aspect)!.orb + 2;
      const tight = 1 - 0.5 * Math.min(1, hit.orb / maxOrb);
      const pull = weight(na, nb) * value(hit.aspect, tone) * tight * (uncertain ? 0.5 : 1);
      found.push({ a: na, b: nb, aspect: hit.aspect, orb: Math.round(hit.orb * 10) / 10, tone, uncertain, pull });
    }
  }

  const count = (points: Partial<Record<Body, number>>) => {
    const c: Record<Element, number> = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    for (const lon of Object.values(points)) c[elementOf(signAt(lon as number))] += 1;
    return c;
  };
  const pairs: ElementPair[] = [];
  const pair = (label: string, x?: number, y?: number) => {
    if (x === undefined || y === undefined) return;
    const ea = elementOf(signAt(x));
    const eb = elementOf(signAt(y));
    pairs.push({ label, a: ea, b: eb, relation: elementRelation(ea, eb) });
  };
  pair("Sun and Sun", pa.Sun, pb.Sun);
  pair("Moon and Moon", pa.Moon, pb.Moon);
  pair("Venus and Venus", pa.Venus, pb.Venus);
  pair("Sun and Moon", pa.Sun, pb.Moon);
  pair("Moon and Sun", pa.Moon, pb.Sun);

  const aspectPull = found.reduce((n, x) => n + x.pull, 0);
  const elementPull = pairs.reduce((n, p) => n + (p.relation === "same" ? 1.5 : p.relation === "compatible" ? 1 : -0.5), 0);
  const score0to100 = Math.max(0, Math.min(100, Math.round(50 + aspectPull * 5 + elementPull * 2)));

  const aspects = found
    .sort((x, y) => Math.abs(y.pull) - Math.abs(x.pull) || x.orb - y.orb)
    .map(({ pull: _pull, ...rest }) => {
      void _pull;
      return rest;
    });

  return { score0to100, aspects, elements: { a: count(pa), b: count(pb), pairs } };
}
