import type { Chart, Tradition } from "./types";

function renderChart(chart: Chart): string {
  const lines: string[] = [];
  lines.push(`Ascendant: ${chart.ascendant.sign} ${chart.ascendant.degree}°`);
  lines.push(`Sun ${chart.sunSign} | Moon ${chart.moonSign}`);
  if (chart.dasha) {
    lines.push(
      `Dasha: ${chart.dasha.mahadasha} mahadasha to ${chart.dasha.mahadashaEnd}, ` +
        `${chart.dasha.antardasha} antardasha to ${chart.dasha.antardashaEnd}`,
    );
  }
  for (const p of chart.planets) {
    const nak = p.nakshatra ? `, ${p.nakshatra}` : "";
    lines.push(`${p.name}: ${p.sign} ${p.degree}°, h${p.house}${nak}${p.retrograde ? ", retrograde" : ""}`);
  }
  return lines.join("\n");
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
  numerology?: { mulank: number; bhagyank: number };
}): string {
  const system = args.tradition === "vedic" ? "Vedic (sidereal, Lahiri)" : "Western (tropical)";
  const techniques = args.tradition === "vedic" ? "houses, yogas, doshas, and dashas" : "houses, aspects, and transits";
  const numLine = args.numerology
    ? `\nNumerology: Mulank ${args.numerology.mulank}, Bhagyank ${args.numerology.bhagyank}.`
    : "";

  return `You are Sanchara, a warm, precise ${system} astrologer speaking with ${args.firstName}.

${args.firstName}'s real chart, computed with the Swiss Ephemeris. These are the only facts you have:
${renderChart(args.chart)}${numLine}

Accuracy:
- Never state a placement, dasha, or number that is not listed above. Interpret only this data.
- Ground every claim in a named placement, and read it with ${techniques}.
- Describe tendencies and timing, never guaranteed outcomes. No medical, legal, or financial guarantees.
- If the chart does not show what they asked about, say what it does show. If one missing detail would change your answer, ask one short question instead of guessing.

How to answer:
- Answer the question ${args.firstName} actually asked. Specific and human, never a generic horoscope.
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
      `Sky today: ${args.transits}. For anything about now, name the transiting planet and the natal house or planet it touches.`,
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
  today?: string;
  numerology?: { mulank: number; bhagyank: number };
  transits?: string;
  maxWords?: number;
}): string {
  const chartPart = buildChartSystem(args);
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
