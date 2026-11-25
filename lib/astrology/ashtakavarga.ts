import { signIndex, SIGNS } from "./constants";
import type { Chart } from "./types";

/**
 * Ashtakavarga: how many of eight points favour each sign, for each of the
 * seven planets (bhinna) and altogether (sarva, always 337).
 *
 * The tables are the widely published ones (Brihat Jataka). BPHS editions
 * differ in four rows, by where a point falls and never by how many, so no
 * total changes between them.
 */
const SEVEN = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"] as const;
export type AvPlanet = (typeof SEVEN)[number];
type Source = AvPlanet | "Lagna";

export const BINDUS: Record<AvPlanet, Record<Source, number[]>> = {
  Sun: { Sun: [1, 2, 4, 7, 8, 9, 10, 11], Moon: [3, 6, 10, 11], Mars: [1, 2, 4, 7, 8, 9, 10, 11], Mercury: [3, 5, 6, 9, 10, 11, 12], Jupiter: [5, 6, 9, 11], Venus: [6, 7, 12], Saturn: [1, 2, 4, 7, 8, 9, 10, 11], Lagna: [3, 4, 6, 10, 11, 12] },
  Moon: { Sun: [3, 6, 7, 8, 10, 11], Moon: [1, 3, 6, 7, 10, 11], Mars: [2, 3, 5, 6, 9, 10, 11], Mercury: [1, 3, 4, 5, 7, 8, 10, 11], Jupiter: [1, 4, 7, 8, 10, 11, 12], Venus: [3, 4, 5, 7, 9, 10, 11], Saturn: [3, 5, 6, 11], Lagna: [3, 6, 10, 11] },
  Mars: { Sun: [3, 5, 6, 10, 11], Moon: [3, 6, 11], Mars: [1, 2, 4, 7, 8, 10, 11], Mercury: [3, 5, 6, 11], Jupiter: [6, 10, 11, 12], Venus: [6, 8, 11, 12], Saturn: [1, 4, 7, 8, 9, 10, 11], Lagna: [1, 3, 6, 10, 11] },
  Mercury: { Sun: [5, 6, 9, 11, 12], Moon: [2, 4, 6, 8, 10, 11], Mars: [1, 2, 4, 7, 8, 9, 10, 11], Mercury: [1, 3, 5, 6, 9, 10, 11, 12], Jupiter: [6, 8, 11, 12], Venus: [1, 2, 3, 4, 5, 8, 9, 11], Saturn: [1, 2, 4, 7, 8, 9, 10, 11], Lagna: [1, 2, 4, 6, 8, 10, 11] },
  Jupiter: { Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11], Moon: [2, 5, 7, 9, 11], Mars: [1, 2, 4, 7, 8, 10, 11], Mercury: [1, 2, 4, 5, 6, 9, 10, 11], Jupiter: [1, 2, 3, 4, 7, 8, 10, 11], Venus: [2, 5, 6, 9, 10, 11], Saturn: [3, 5, 6, 12], Lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11] },
  Venus: { Sun: [8, 11, 12], Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12], Mars: [3, 5, 6, 9, 11, 12], Mercury: [3, 5, 6, 9, 11], Jupiter: [5, 8, 9, 10, 11], Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11], Saturn: [3, 4, 5, 8, 9, 10, 11], Lagna: [1, 2, 3, 4, 5, 8, 9, 11] },
  Saturn: { Sun: [1, 2, 4, 7, 8, 10, 11], Moon: [3, 6, 11], Mars: [3, 5, 6, 10, 11, 12], Mercury: [6, 8, 9, 10, 11, 12], Jupiter: [5, 6, 11, 12], Venus: [6, 11, 12], Saturn: [3, 5, 6, 11], Lagna: [1, 3, 4, 6, 10, 11] },
};

export type Ashtakavarga = { bhinna: Record<AvPlanet, number[]>; /** Indexed by sign, Aries first. */ sarva: number[]; ascendant: string };

/** Null without a birth time (the lagna is one of the eight points), or for a chart that is not Vedic. */
export function ashtakavarga(chart: Chart): Ashtakavarga | null {
  if (chart.tradition !== "vedic" || chart.timeKnown === false) return null;
  const at = {} as Record<Source, number>;
  for (const name of SEVEN) at[name] = signIndex(chart.planets.find((p) => p.name === name)?.sign ?? "");
  at.Lagna = signIndex(chart.ascendant.sign);
  if (Object.values(at).some((i) => i < 0)) return null;

  const bhinna = {} as Record<AvPlanet, number[]>;
  const sarva = Array<number>(12).fill(0);
  for (const planet of SEVEN) {
    const row = Array<number>(12).fill(0);
    for (const source of Object.keys(BINDUS[planet]) as Source[]) {
      for (const n of BINDUS[planet][source]) row[(at[source] + n - 1) % 12]++;
    }
    bhinna[planet] = row;
    row.forEach((v, i) => (sarva[i] += v));
  }
  return { bhinna, sarva, ascendant: chart.ascendant.sign };
}

export function describeAshtakavarga(av: Ashtakavarga): string {
  const asc = signIndex(av.ascendant);
  const lines = ["ASHTAKAVARGA, before any reduction. Sarva points by house (28 is average; 30 or more is strong, 25 or fewer is weak; all twelve add to 337):"];
  for (let h = 1; h <= 12; h++) {
    const i = (asc + h - 1) % 12;
    lines.push(`- House ${h}, ${SIGNS[i]}: ${av.sarva[i]} (${SEVEN.map((p) => `${p} ${av.bhinna[p][i]}`).join(", ")})`);
  }
  lines.push("The numbers in brackets are each planet's own points there, out of 8: 5 or more and its transit of that house helps, 3 or fewer and it strains. Quote these numbers as they are; never add or recompute.");
  return lines.join("\n");
}
