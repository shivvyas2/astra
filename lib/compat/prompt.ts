import type { Chart, Tradition } from "@/lib/astrology/types";
import { factsFor } from "@/lib/astrology/derived";
import { renderChartForPrompt } from "@/lib/astrology/prompt";
import type { Compatibility } from "./compatibility";

/** "1", "1.5", "27.5": gunas come in halves. */
function n(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The second person in a match reading: their chart, rendered the way the
 * user's own is, and the Guna Milan and synastry already computed from the
 * two. Appended to the stable system block, since none of it changes during
 * the conversation.
 *
 * The scores are given, never asked for: a model that recomputes a koota
 * gets it wrong, so the rules say to quote them as they stand.
 */
export function describeMatchForPrompt(args: {
  you: string;
  them: { name: string; relationship: string; chart: Chart };
  tradition: Tradition;
  compat: Compatibility;
}): string {
  const { you, them, compat } = args;
  const g = compat.guna;
  const lines: string[] = [];

  lines.push(`\n\nTHE OTHER PERSON`);
  lines.push(
    `This conversation is about ${you} and ${them.name} (${them.relationship}) together. ${them.name}'s chart, computed the same way:`,
  );
  lines.push(renderChartForPrompt(them.chart, factsFor(them.chart)));

  if (args.tradition === "vedic") {
    const groom = g.groom === "you" ? you : them.name;
    lines.push(`\nGUNA MILAN (Ashtakoota, ${groom}'s chart read as the groom's)`);
    lines.push(`Total: ${n(g.total)} of 36. ${g.verdict} With the roles swapped: ${n(g.swappedTotal)} of 36.`);
    for (const k of g.kootas) {
      lines.push(`- ${k.name} ${n(k.score)}/${k.max}: ${you} ${k.you}, ${them.name} ${k.them}. ${k.note}`);
    }
    for (const d of g.doshas) {
      const exceptions = d.exceptions.length ? ` Exceptions: ${d.exceptions.join("; ")}.` : "";
      lines.push(`- ${d.kind[0].toUpperCase()}${d.kind.slice(1)} dosha: ${d.present ? "present" : "absent"}. ${d.note}${exceptions}`);
    }
  }

  const s = compat.synastry;
  lines.push(`\nSYNASTRY (tropical, ${you}'s planets to ${them.name}'s): ${s.score0to100} of 100.`);
  for (const a of s.aspects.slice(0, 8)) {
    const caveat = a.uncertain ? ", depends on an unknown birth time" : "";
    lines.push(`- ${you}'s ${a.a} ${a.aspect} ${them.name}'s ${a.b} (${a.orb}°, ${a.tone}${caveat})`);
  }

  lines.push(`\nReading a match:
- Answer about the two of them together, from both charts and the scores above.
- Quote the guna total and each koota exactly as given. Never recompute a score or a dosha.
- A low score or a dosha is a tendency to work with, not a verdict on the relationship. Name what each person can do about it.
- Never tell anyone to marry, leave or stay with someone.`);

  return lines.join("\n");
}
