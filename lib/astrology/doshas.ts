import type { Chart, Planet } from "./types";
import { SIGNS, signIndex, houseFrom, ORDINAL } from "./constants";

export type Severity = "info" | "caution" | "warning";

/**
 * One affliction found in a chart, or in today's sky read against that chart.
 *
 * `signature` is what makes a condition *change*: it folds in the phase and the
 * sign involved, so Saturn moving on, or Sade Sati stepping from rising to
 * peak, reads as a new condition rather than the same one continuing. The daily
 * job diffs signatures, which is how "tell me when something changes" works.
 */
export type Condition = {
  kind: string;
  signature: string;
  label: string;
  severity: Severity;
  scope: "natal" | "transit";
  /** A plain factual sentence — the grounding the model is allowed to interpret. */
  detail: string;
};

const SEVERITY_RANK: Record<Severity, number> = { info: 0, caution: 1, warning: 2 };

export function highestSeverity(conditions: { severity: Severity }[]): Severity {
  return conditions.reduce<Severity>(
    (worst, c) => (SEVERITY_RANK[c.severity] > SEVERITY_RANK[worst] ? c.severity : worst),
    "info",
  );
}

/** Absolute ecliptic longitude, rebuilt from the stored sign + degree-in-sign. */
function longitudeOf(planet: Planet): number {
  return signIndex(planet.sign) * 30 + planet.degree;
}

export { houseFrom };

function planet(chart: Chart, name: string): Planet | undefined {
  return chart.planets.find((p) => p.name === name);
}

/**
 * Standing afflictions in the birth chart itself. These do not change, so the
 * daily job reports them once, when a chart is first read.
 */
export function detectNatalDoshas(chart: Chart): Condition[] {
  const found: Condition[] = [];
  const mars = planet(chart, "Mars");
  const sun = planet(chart, "Sun");
  const moon = planet(chart, "Moon");
  const saturn = planet(chart, "Saturn");
  const rahu = planet(chart, "Rahu");
  const ketu = planet(chart, "Ketu");

  // Mangal (Manglik) dosha: Mars in 1, 2, 4, 7, 8 or 12 from the ascendant.
  // Derived from the sign, not `mars.house`: a chart stored before the
  // whole-sign change carries a stale Placidus house number, and this must
  // agree with the whole-sign facts deriveFacts.ts computes from the same
  // sign — see doshas.test.ts and derived.test.ts for the stale-house cases.
  // With no birth time the ascendant is a noon guess, so it is not read at all.
  const lagnaKnown = chart.timeKnown !== false;
  if (mars && lagnaKnown) {
    const marsHouse = houseFrom(chart.ascendant.sign, mars.sign);
    if ([1, 2, 4, 7, 8, 12].includes(marsHouse)) {
      found.push({
        kind: "mangal_dosha",
        signature: `mangal_dosha:${marsHouse}`,
        label: "Mangal Dosha",
        severity: "caution",
        scope: "natal",
        detail: `Mars sits in the ${ORDINAL[marsHouse]} house from the ascendant in ${mars.sign}.`,
      });
    }
  }

  // Kaal Sarp: every classical planet hemmed inside the Rahu–Ketu axis.
  if (rahu && ketu) {
    const rahuLon = longitudeOf(rahu);
    const others = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]
      .map((name) => planet(chart, name))
      .filter((p): p is Planet => Boolean(p));
    if (others.length === 7) {
      const arcs = others.map((p) => (((longitudeOf(p) - rahuLon) % 360) + 360) % 360);
      const allAhead = arcs.every((a) => a > 0 && a < 180);
      const allBehind = arcs.every((a) => a > 180);
      if (allAhead || allBehind) {
        found.push({
          kind: "kaal_sarp",
          signature: `kaal_sarp:${rahu.sign}`,
          label: "Kaal Sarp Yoga",
          severity: "warning",
          scope: "natal",
          detail: `Every planet falls on one side of the Rahu–Ketu axis (Rahu in ${rahu.sign}, Ketu in ${ketu.sign}).`,
        });
      }
    }
  }

  // Grahan (eclipse) dosha: the luminaries sharing a sign with a node.
  for (const luminary of [sun, moon]) {
    if (!luminary) continue;
    for (const node of [rahu, ketu]) {
      if (!node || node.sign !== luminary.sign) continue;
      found.push({
        kind: `grahan_${luminary.name.toLowerCase()}`,
        signature: `grahan_${luminary.name.toLowerCase()}:${node.name}:${node.sign}`,
        label: `Grahan Dosha (${luminary.name}–${node.name})`,
        severity: "caution",
        scope: "natal",
        detail: `${luminary.name} and ${node.name} share ${node.sign} in the birth chart.`,
      });
    }
  }

  // Kemadruma: no planet in the 2nd or 12th from the Moon (nodes and Sun excluded).
  if (moon) {
    const neighbours = chart.planets.filter((p) => {
      if (["Moon", "Sun", "Rahu", "Ketu"].includes(p.name)) return false;
      const h = houseFrom(moon.sign, p.sign);
      return h === 2 || h === 12;
    });
    if (neighbours.length === 0) {
      found.push({
        kind: "kemadruma",
        signature: `kemadruma:${moon.sign}`,
        label: "Kemadruma Yoga",
        severity: "caution",
        scope: "natal",
        detail: `The Moon in ${moon.sign} has no planet in the sign before or after it.`,
      });
    }
  }

  // Pitru dosha, in its most commonly cited form: a node in the 9th house.
  // Derived from the sign, not `node.house`, for the same reason as Mangal
  // dosha above.
  for (const node of [rahu, ketu]) {
    if (lagnaKnown && node && houseFrom(chart.ascendant.sign, node.sign) === 9) {
      found.push({
        kind: "pitru_dosha",
        signature: `pitru_dosha:${node.name}:${node.sign}`,
        label: "Pitru Dosha",
        severity: "info",
        scope: "natal",
        detail: `${node.name} occupies the 9th house, the house of forebears, in ${node.sign}.`,
      });
    }
  }

  // Shrapit: Saturn and Rahu together.
  if (saturn && rahu && saturn.sign === rahu.sign) {
    found.push({
      kind: "shrapit_dosha",
      signature: `shrapit_dosha:${saturn.sign}`,
      label: "Shrapit Dosha",
      severity: "caution",
      scope: "natal",
      detail: `Saturn and Rahu are joined in ${saturn.sign}.`,
    });
  }

  return found;
}

/**
 * Afflictions formed by today's sky against the birth chart. These are the ones
 * that come and go, and the ones worth a notification when they do.
 */
export function detectTransitAfflictions(natal: Chart, transit: Chart): Condition[] {
  const found: Condition[] = [];
  const natalMoon = planet(natal, "Moon");
  // Null when the birth time is unknown: nothing is read from a noon ascendant.
  const lagna = natal.timeKnown === false ? null : natal.ascendant.sign;

  const tSaturn = planet(transit, "Saturn");
  const tMars = planet(transit, "Mars");
  const tRahu = planet(transit, "Rahu");
  const tKetu = planet(transit, "Ketu");
  const tSun = planet(transit, "Sun");
  const tJupiter = planet(transit, "Jupiter");

  if (natalMoon && tSaturn) {
    const h = houseFrom(natalMoon.sign, tSaturn.sign);
    const phase = h === 12 ? "rising" : h === 1 ? "peak" : h === 2 ? "setting" : null;
    if (phase) {
      found.push({
        kind: "sade_sati",
        signature: `sade_sati:${phase}:${tSaturn.sign}`,
        label: `Sade Sati (${phase} phase)`,
        severity: phase === "peak" ? "warning" : "caution",
        scope: "transit",
        detail: `Saturn is transiting ${tSaturn.sign}, the ${ORDINAL[h]} from the natal Moon in ${natalMoon.sign} — the ${phase} phase of Sade Sati.`,
      });
    } else if (h === 4 || h === 8) {
      found.push({
        kind: "shani_dhaiya",
        signature: `shani_dhaiya:${h}:${tSaturn.sign}`,
        label: "Shani Dhaiya",
        severity: "caution",
        scope: "transit",
        detail: `Saturn is transiting ${tSaturn.sign}, the ${ORDINAL[h]} from the natal Moon — the two-and-a-half-year Dhaiya.`,
      });
    }
  }

  if (tSaturn && lagna) {
    const h = houseFrom(lagna, tSaturn.sign);
    if ([4, 7, 10].includes(h)) {
      found.push({
        kind: "kantaka_shani",
        signature: `kantaka_shani:${h}:${tSaturn.sign}`,
        label: "Kantaka Shani",
        severity: "info",
        scope: "transit",
        detail: `Saturn transits the ${ORDINAL[h]} from the ${lagna} ascendant.`,
      });
    }
  }

  for (const node of [tRahu, tKetu]) {
    if (!node) continue;
    if (natalMoon && node.sign === natalMoon.sign) {
      found.push({
        kind: `node_over_moon_${node.name.toLowerCase()}`,
        signature: `node_over_moon_${node.name.toLowerCase()}:${node.sign}`,
        label: `${node.name} over the natal Moon`,
        severity: "caution",
        scope: "transit",
        detail: `${node.name} is transiting ${node.sign}, the natal Moon's own sign.`,
      });
    }
    if (lagna && node.sign === lagna) {
      found.push({
        kind: `node_over_lagna_${node.name.toLowerCase()}`,
        signature: `node_over_lagna_${node.name.toLowerCase()}:${node.sign}`,
        label: `${node.name} over the ascendant`,
        severity: "caution",
        scope: "transit",
        detail: `${node.name} is transiting ${node.sign}, the ascendant sign.`,
      });
    }
  }

  if (natalMoon && tMars && tMars.sign === natalMoon.sign) {
    found.push({
      kind: "angarak_transit",
      signature: `angarak_transit:${tMars.sign}`,
      label: "Mars over the natal Moon",
      severity: "caution",
      scope: "transit",
      detail: `Mars is transiting ${tMars.sign}, conjunct the natal Moon by sign.`,
    });
  }

  if (natalMoon && tSun && houseFrom(natalMoon.sign, tSun.sign) === 8) {
    found.push({
      kind: "ashtama_surya",
      signature: `ashtama_surya:${tSun.sign}`,
      label: "Ashtama Surya",
      severity: "info",
      scope: "transit",
      detail: `The Sun transits ${tSun.sign}, the 8th from the natal Moon, for about a month.`,
    });
  }

  if (natalMoon && tJupiter) {
    const h = houseFrom(natalMoon.sign, tJupiter.sign);
    if ([6, 8, 12].includes(h)) {
      found.push({
        kind: "guru_6_8_12",
        signature: `guru_6_8_12:${h}:${tJupiter.sign}`,
        label: "Jupiter in a weak transit house",
        severity: "info",
        scope: "transit",
        detail: `Jupiter transits ${tJupiter.sign}, the ${ORDINAL[h]} from the natal Moon.`,
      });
    }
  }

  if (tJupiter && tRahu && tJupiter.sign === tRahu.sign) {
    found.push({
      kind: "guru_chandal_transit",
      signature: `guru_chandal_transit:${tJupiter.sign}`,
      label: "Guru Chandal",
      severity: "info",
      scope: "transit",
      detail: `Jupiter and Rahu are transiting ${tJupiter.sign} together.`,
    });
  }

  // Retrogrades only matter here when they fall on a sensitive sign.
  for (const name of ["Saturn", "Mars", "Mercury"]) {
    const p = planet(transit, name);
    if (!p?.retrograde) continue;
    const sensitive = p.sign === lagna || p.sign === natalMoon?.sign;
    if (!sensitive) continue;
    found.push({
      kind: `retrograde_${name.toLowerCase()}`,
      signature: `retrograde_${name.toLowerCase()}:${p.sign}`,
      label: `${name} retrograde on a sensitive sign`,
      severity: "info",
      scope: "transit",
      detail: `${name} is retrograde in ${p.sign}, ${p.sign === lagna ? "the ascendant sign" : "the natal Moon's sign"}.`,
    });
  }

  return found;
}

export function detectConditions(natal: Chart, transit: Chart): Condition[] {
  return [...detectNatalDoshas(natal), ...detectTransitAfflictions(natal, transit)];
}
