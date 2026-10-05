import type { Chart } from "@/lib/astrology/types";
import {
  computeAshtakoot,
  gunaVerdict,
  mangalDosha,
  mangalNote,
  moonPointOf,
  padaOf,
  type DoshaNote,
  type KootaKey,
} from "./ashtakoot";
import { computeSynastry, type Synastry, type SynastryAspect } from "./synastry";

/**
 * Everything `GET /api/compatibility` answers with, computed from the two
 * stored charts alone. No model call: the summary is written from the
 * numbers, so the same pair always reads the same way, and the reading proper
 * is one tap away through `askPrompt`.
 */

export type ChartPair = { vedic: Chart; western?: Chart | null };

export type Side = "you" | "them";

export type KootaForClient = {
  key: KootaKey;
  name: string;
  score: number;
  max: number;
  note: string;
  /** This koota's category for each person: "Kshatriya", "Deer", "Mars", "Taurus". */
  you: string;
  them: string;
};

export type Compatibility = {
  guna: {
    total: number;
    max: 36;
    kootas: KootaForClient[];
    doshas: DoshaNote[];
    verdict: string;
    /** Whose chart was read as the groom's — a few kootas are not symmetric. */
    groom: Side;
    /** The total with the roles swapped. */
    swappedTotal: number;
  };
  synastry: Synastry;
  summary: string;
  askPrompt: string;
  people: Record<Side, { name: string; moonSign: string; nakshatra: string; pada: number | null; timeKnown: boolean; sunSign: string }>;
};

const BODY_PHRASE: Record<string, string> = { Ascendant: "Ascendant" };

function aspectSentence(x: SynastryAspect, them: string): string {
  const a = BODY_PHRASE[x.a] ?? x.a;
  const b = BODY_PHRASE[x.b] ?? x.b;
  return `your ${a} ${x.aspect === "conjunction" ? "conjunct" : x.aspect} ${them}'s ${b} (${x.orb}°)`;
}

/** "1", "1.5", "27.5" — gunas come in halves. */
function n(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function computeCompatibility(args: {
  you: { name: string; chart: ChartPair };
  them: { name: string; relationship?: string; chart: ChartPair };
  /** Whose chart is read as the groom's. Defaults to "you". */
  groom?: Side;
}): Compatibility {
  const groomSide: Side = args.groom ?? "you";
  const youMoon = moonPointOf(args.you.chart.vedic);
  const themMoon = moonPointOf(args.them.chart.vedic);

  const forward = computeAshtakoot(
    groomSide === "you" ? { groom: youMoon, bride: themMoon } : { groom: themMoon, bride: youMoon },
  );
  const swapped = computeAshtakoot(
    groomSide === "you" ? { groom: themMoon, bride: youMoon } : { groom: youMoon, bride: themMoon },
  );

  const kootas: KootaForClient[] = forward.kootas.map((k) => ({
    key: k.key,
    name: k.name,
    score: k.score,
    max: k.max,
    note: k.note,
    you: groomSide === "you" ? k.groom : k.bride,
    them: groomSide === "you" ? k.bride : k.groom,
  }));

  const doshas = [
    ...forward.doshas,
    mangalNote(mangalDosha(args.you.chart.vedic), mangalDosha(args.them.chart.vedic), {
      a: "You",
      b: args.them.name,
    }),
  ];

  const synastry = computeSynastry(args.you.chart, args.them.chart);
  const verdict = gunaVerdict(forward.total);

  const youTimeKnown = args.you.chart.vedic.timeKnown !== false;
  const themTimeKnown = args.them.chart.vedic.timeKnown !== false;

  // The summary, from the numbers only.
  const parts: string[] = [];
  parts.push(`${n(forward.total)} of 36 gunas: ${verdict.charAt(0).toLowerCase()}${verdict.slice(1)} by the traditional reckoning.`);
  const strongest = [...kootas].sort((a, b) => b.score / b.max - a.score / a.max)[0];
  const weakest = [...kootas].sort((a, b) => a.score / a.max - b.score / b.max)[0];
  if (strongest && weakest && strongest.key !== weakest.key) {
    parts.push(
      `Strongest is ${strongest.name} (${n(strongest.score)}/${strongest.max}); weakest is ${weakest.name} (${n(weakest.score)}/${weakest.max}).`,
    );
  }
  const present = doshas.filter((d) => d.present && d.kind !== "mangal");
  if (present.length > 0) {
    parts.push(
      `${present.map((d) => (d.kind === "nadi" ? "Nadi" : "Bhakoot")).join(" and ")} dosha ${present.length > 1 ? "are" : "is"} present` +
        (present.some((d) => d.exceptions.length > 0) ? ", though a classical exception may apply." : "."),
    );
  }
  const harmonious = synastry.aspects.find((x) => x.tone === "harmonious");
  const challenging = synastry.aspects.find((x) => x.tone === "challenging");
  if (harmonious) parts.push(`In Western synastry the warmest contact is ${aspectSentence(harmonious, args.them.name)}.`);
  if (challenging) parts.push(`The one to handle with care is ${aspectSentence(challenging, args.them.name)}.`);
  parts.push(`Synastry score ${synastry.score0to100}/100.`);
  if (!youTimeKnown || !themTimeKnown) {
    const who = [!youTimeKnown ? "your" : "", !themTimeKnown ? `${args.them.name}'s` : ""].filter(Boolean).join(" and ");
    parts.push(`Without ${who} birth time the Ascendant is left out, and the Moon's nakshatra could differ.`);
  }

  const relation = args.them.relationship && args.them.relationship !== "other" ? ` (my ${args.them.relationship})` : "";
  const doshaWords = present.length > 0 ? ` with ${present.map((d) => (d.kind === "nadi" ? "Nadi" : "Bhakoot")).join(" and ")} dosha` : "";
  const themMoonText = `${themMoon.sign} Moon in ${themMoon.nakshatra}`;
  const askPrompt =
    `${args.them.name}${relation} has a ${themMoonText}, Sun in ${args.them.chart.vedic.sunSign} (sidereal). ` +
    `We score ${n(forward.total)}/36 in Guna Milan${doshaWords}. ` +
    `Read my chart alongside theirs: where do we fit, where will we rub, and what should I keep in mind?`;

  const personOf = (name: string, chart: ChartPair, moon: typeof youMoon) => ({
    name,
    moonSign: moon.sign,
    nakshatra: moon.nakshatra,
    pada: chart.vedic.timeKnown === false ? null : padaOf(moon) ?? null,
    timeKnown: chart.vedic.timeKnown !== false,
    sunSign: chart.vedic.sunSign,
  });

  return {
    guna: {
      total: forward.total,
      max: 36,
      kootas,
      doshas,
      verdict,
      groom: groomSide,
      swappedTotal: swapped.total,
    },
    synastry,
    summary: parts.join(" "),
    askPrompt,
    people: {
      you: personOf(args.you.name, args.you.chart, youMoon),
      them: personOf(args.them.name, args.them.chart, themMoon),
    },
  };
}
