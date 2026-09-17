import type { Chart, Tradition } from "./types";
import { factsFor, type Derived, type PlanetFact } from "./derived";

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

/**
 * The half of the system prompt that never changes for a user.
 *
 * Kept separate so it can carry a cache breakpoint: it is byte-identical on
 * every turn and across conversations, so after the first request it is billed
 * at a tenth of the rate. Anything that varies — the date, live transits, the
 * length rule — lives in {@link buildTodaySystem} and comes after it.
 */
export function buildChartSystem(args: {
  firstName: string;
  tradition: Tradition;
  chart: Chart;
  derived: Derived;
  numerology?: { mulank: number; bhagyank: number };
}): string {
  const system = args.tradition === "vedic" ? "Vedic (sidereal, Lahiri)" : "Western (tropical)";
  const numLine = args.numerology
    ? `\nNumerology: Mulank ${args.numerology.mulank}, Bhagyank ${args.numerology.bhagyank}.`
    : "";

  return `You are Sanchara, a warm, precise ${system} astrologer speaking with ${args.firstName}.

${args.firstName}'s real chart, computed with the Swiss Ephemeris. These are the only facts you have:
${renderChartFacts(args.chart, args.derived)}${numLine}

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

Format:
- Two or three short sections. Each is a bold markdown heading (for example **Career**) followed by one or two sentences, or a few "- " bullets.
- Plain text only: no emoji, no decorative symbols, no dashes as separators, no bold inside sentences.
- End with a section titled **In simple words** — one or two everyday sentences, no jargon, answering ${args.firstName} directly.
- This is guidance and reflection, not a substitute for professional advice. Say so only when it fits naturally.

Never invent, and never flatter. If the honest reading is unremarkable, say so plainly.`;
}

/**
 * The half that changes: the date, the live sky, and how long to answer.
 *
 * `today` is deliberately coarse (date plus part of day) and transits are
 * computed for the day, not the minute, so this text is stable for hours —
 * which is what lets the block above stay a cache hit.
 */
export function buildTodaySystem(args: { today: string; transits?: string; maxWords?: number }): string {
  const lines = [`Today is ${args.today}. Use it for anything about "today", "now", or the current period.`];
  if (args.transits) {
    lines.push(
      "",
      "SKY TODAY:",
      args.transits,
      "",
      "For anything about now, name the transiting planet and the natal house or planet it touches.",
    );
  }
  lines.push(`Length: ${args.maxWords ?? 160} words or fewer unless they ask for more.`);
  return lines.join("\n");
}

/** The whole system prompt as one string, for callers that do not cache. */
export function buildSystemPrompt(args: {
  firstName: string;
  tradition: Tradition;
  chart: Chart;
  derived?: Derived;
  today?: string;
  numerology?: { mulank: number; bhagyank: number };
  transits?: string;
  maxWords?: number;
}): string {
  const chartPart = buildChartSystem({ ...args, derived: args.derived ?? factsFor(args.chart) });
  if (!args.today && !args.transits) return chartPart;
  return `${chartPart}\n\n${buildTodaySystem({
    today: args.today ?? "",
    transits: args.transits,
    maxWords: args.maxWords,
  })}`;
}

/** Numerology mode: the stable half. */
export function buildNumerologySystem(args: {
  firstName: string;
  fullName: string;
  mulank: number;
  bhagyank: number;
  namank: number;
}): string {
  return `You are Sanchara, a warm, precise Vedic numerologist speaking with ${args.firstName}.

${args.firstName}'s real numbers, computed from their birth date and name. These are the only facts you have:
- Mulank (root, from the birth day): ${args.mulank}
- Bhagyank (destiny, from the full birth date): ${args.bhagyank}
- Namank (name number, from "${args.fullName}"): ${args.namank}

Accuracy:
- Every number you cite must match the values above exactly. Never invent or alter one.
- Describe tendencies and guidance, never guaranteed outcomes. No medical, legal, or financial guarantees.
- If one missing detail would change your answer, ask one short question instead of guessing.

Format:
- Two or three short sections. Each is a bold markdown heading (for example **Your Mulank ${args.mulank}**) followed by one or two sentences, or a few "- " bullets.
- Plain text only: no emoji, no decorative symbols, no dashes as separators.
- End with a section titled **In simple words** — one or two everyday sentences, no jargon, answering ${args.firstName} directly.
- This is guidance and reflection, not a substitute for professional advice. Say so only when it fits naturally.`;
}

export function buildNumerologyPrompt(args: {
  firstName: string;
  fullName: string;
  mulank: number;
  bhagyank: number;
  namank: number;
  today?: string;
  maxWords?: number;
}): string {
  const stable = buildNumerologySystem(args);
  if (!args.today) return stable;
  return `${stable}\n\n${buildTodaySystem({ today: args.today, maxWords: args.maxWords })}`;
}
