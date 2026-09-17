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

// Zodiacal order. oppositeSign, and a later task's house loop, both rely on
// Object.keys(SIGN_LORD) coming back in this order — do not reorder or sort.
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
  const mt = MOOLATRIKONA[name];

  // Mercury (Virgo) and the Moon (Taurus) have the same sign for exaltation
  // and moolatrikona. There the moolatrikona range takes precedence within
  // its own bounds; exaltation applies only below the range's `from` degree,
  // and own sign resumes above its `to` degree when the sign is also owned
  // by the planet. Every other planet has distinct exaltation and
  // moolatrikona signs, so this block is inert for them.
  //
  // This block owns the whole degree span of the sign once entered, and it
  // must return on every path: falling out of it would hit the unconditional
  // exaltation check just below and mislabel a degree that isn't exalted.
  // The final `neutral` only matters if some future table entry shares an
  // exaltation and moolatrikona sign without ruling it outright — keep it
  // rather than "simplifying" this into a plain if/else-if chain.
  if (ex && mt && sign === ex.sign && sign === mt.sign) {
    if (degree < mt.from) return { dignity: "exalted", fromDeepPoint };
    if (degree < mt.to) return { dignity: "moolatrikona", fromDeepPoint };
    if (signsRuledBy(name).includes(sign)) return { dignity: "own" };
    return { dignity: "neutral" };
  }

  if (ex && sign === ex.sign) return { dignity: "exalted", fromDeepPoint };

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
