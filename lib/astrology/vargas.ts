import { houseFrom, signIndex, SIGNS } from "./constants";
import { EXALTATION, SIGN_LORD } from "./derived";
import type { Chart } from "./types";

/**
 * Divisional charts (vargas), from the positions already stored with a chart:
 * no ephemeris run, no migration. The Parashari rules, in which each sign is
 * cut into N parts and each part is given a sign.
 *
 * Every one of these is cut from the birth minute, so a chart without a birth
 * time has none, and one whose ascendant sits near a cut says so.
 */
export const VARGAS = ["D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"] as const;
export type Varga = (typeof VARGAS)[number];

export const VARGA_ABOUT: Record<Varga, string> = {
  D2: "Hora: wealth",
  D3: "Drekkana: siblings, courage",
  D4: "Chaturthamsa: home, property",
  D7: "Saptamsa: children",
  D9: "Navamsa: marriage, the partner, inner strength",
  D10: "Dasamsa: career, standing",
  D12: "Dwadasamsa: parents",
  D16: "Shodasamsa: vehicles, comforts",
  D20: "Vimsamsa: spiritual practice",
  D24: "Chaturvimsamsa: education",
  D27: "Saptavimsamsa: strengths and weaknesses",
  D30: "Trimsamsa: difficulties",
  D40: "Khavedamsa: the mother's line",
  D45: "Akshavedamsa: the father's line",
  D60: "Shashtiamsa: the past behind the present",
};

type Rule = { parts: number; start: (sign: number) => number; step?: number };

const odd = (s: number) => s % 2 === 0; // Aries is index 0, the first odd sign
/** Movable, fixed, dual: a different starting sign for each. */
const byMode = (movable: number, fixed: number, dual: number) => (s: number) => [movable, fixed, dual][s % 3];
const byElement = (fire: number, earth: number, air: number, water: number) => (s: number) => [fire, earth, air, water][s % 4];

const RULES: Partial<Record<Varga, Rule>> = {
  D3: { parts: 3, start: (s) => s, step: 4 },
  D4: { parts: 4, start: (s) => s, step: 3 },
  D7: { parts: 7, start: (s) => (odd(s) ? s : s + 6) },
  D9: { parts: 9, start: byElement(0, 9, 6, 3) },
  D10: { parts: 10, start: (s) => (odd(s) ? s : s + 8) },
  D12: { parts: 12, start: (s) => s },
  D16: { parts: 16, start: byMode(0, 4, 8) },
  D20: { parts: 20, start: byMode(0, 8, 4) },
  D24: { parts: 24, start: (s) => (odd(s) ? 4 : 3) },
  D27: { parts: 27, start: byElement(0, 3, 6, 9) },
  D40: { parts: 40, start: (s) => (odd(s) ? 0 : 6) },
  D45: { parts: 45, start: byMode(0, 4, 8) },
  D60: { parts: 60, start: (s) => s },
};

/** Trimsamsa's five unequal parts: [up to this degree, sign]. */
const D30_ODD: [number, number][] = [[5, 0], [10, 10], [18, 8], [25, 2], [30, 6]];
const D30_EVEN: [number, number][] = [[5, 1], [12, 5], [20, 11], [25, 9], [30, 7]];

/** The sign index a position takes in a varga. `degree` is within its sign. */
export function vargaSign(varga: Varga, sign: number, degree: number): number {
  const deg = Math.min(Math.max(degree, 0), 29.999999);
  if (varga === "D2") return odd(sign) === deg < 15 ? 4 : 3; // Leo, Cancer
  if (varga === "D30") return (odd(sign) ? D30_ODD : D30_EVEN).find(([to]) => deg < to)![1];
  const rule = RULES[varga]!;
  const part = Math.floor((deg * rule.parts) / 30 + 1e-9);
  return (rule.start(sign) + part * (rule.step ?? 1)) % 12;
}

/** Degrees from a position to the nearest cut of its varga. */
function toNearestCut(varga: Varga, sign: number, degree: number): number {
  const cuts =
    varga === "D30"
      ? [0, ...(odd(sign) ? D30_ODD : D30_EVEN).map(([to]) => to)]
      : Array.from({ length: (varga === "D2" ? 2 : RULES[varga]!.parts) + 1 }, (_, i) => (i * 30) / (varga === "D2" ? 2 : RULES[varga]!.parts));
  return Math.min(...cuts.map((c) => Math.abs(c - degree)));
}

export type VargaPlanet = { name: string; sign: string; house: number; retrograde: boolean; dignity: "exalted" | "debilitated" | "own" | null; vargottama: boolean };
export type VargaChart = { varga: Varga; ascendant: string; planets: VargaPlanet[]; /** About how many minutes of birth time would move its ascendant. */ edgeMinutes: number };

/** The rising sign moves a degree in about four minutes; enough to warn by. */
const MINUTES_PER_DEGREE = 4;

/** Null without a birth time, or for a chart that is not Vedic. */
export function vargaChart(chart: Chart, varga: Varga): VargaChart | null {
  if (chart.tradition !== "vedic" || chart.timeKnown === false) return null;
  const asc = signIndex(chart.ascendant.sign);
  if (asc < 0) return null;
  const ascendant = SIGNS[vargaSign(varga, asc, chart.ascendant.degree)];
  const planets = chart.planets
    .filter((p) => signIndex(p.sign) >= 0)
    .map((p): VargaPlanet => {
      const sign = SIGNS[vargaSign(varga, signIndex(p.sign), p.degree)];
      const exalted = EXALTATION[p.name]?.sign;
      return {
        name: p.name,
        sign,
        house: houseFrom(ascendant, sign),
        retrograde: p.retrograde,
        dignity: !exalted
          ? null
          : sign === exalted
            ? "exalted"
            : houseFrom(exalted, sign) === 7
              ? "debilitated"
              : SIGN_LORD[sign] === p.name
                ? "own"
                : null,
        vargottama: sign === p.sign,
      };
    });
  return { varga, ascendant, planets, edgeMinutes: Math.round(toNearestCut(varga, asc, chart.ascendant.degree) * MINUTES_PER_DEGREE) };
}

/** A varga as a reading is given it. */
export function describeVarga(v: VargaChart): string {
  const lines = [`${v.varga} (${VARGA_ABOUT[v.varga]}). Ascendant ${v.ascendant}.`];
  for (const p of v.planets) {
    const bits = [p.dignity === "own" ? "in its own sign" : p.dignity, v.varga === "D9" && p.vargottama ? "vargottama (same sign as the birth chart)" : null, p.retrograde && p.name !== "Rahu" && p.name !== "Ketu" ? "retrograde" : null].filter(Boolean);
    lines.push(`- ${p.name}: ${p.sign}, ${v.varga} house ${p.house}${bits.length ? `, ${bits.join(", ")}` : ""}`);
  }
  for (let h = 1; h <= 12; h++) {
    const sign = SIGNS[(signIndex(v.ascendant) + h - 1) % 12];
    const lord = v.planets.find((p) => p.name === SIGN_LORD[sign]);
    if (lord) lines.push(`- ${v.varga} house ${h}: ${sign}, lord ${lord.name} in ${v.varga} house ${lord.house}`);
  }
  if (v.edgeMinutes < 6) {
    lines.push(`Caution: a birth time off by about ${Math.max(1, v.edgeMinutes)} minute${v.edgeMinutes > 1 ? "s" : ""} would change this chart's ascendant and all its houses. Say so once, and lean on the planets' signs.`);
  }
  return lines.join("\n");
}
