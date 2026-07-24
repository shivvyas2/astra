import type { Chart, Tradition } from "./types";

function renderChart(chart: Chart): string {
  const lines: string[] = [];
  lines.push(`Ascendant (Lagna/Rising): ${chart.ascendant.sign} ${chart.ascendant.degree}°`);
  lines.push(`Sun sign: ${chart.sunSign} | Moon sign: ${chart.moonSign}`);
  if (chart.ayanamsa) lines.push(`Ayanamsa (Lahiri): ${chart.ayanamsa}°`);
  if (chart.dasha) {
    lines.push(
      `Current Vimshottari dasha: ${chart.dasha.mahadasha} mahadasha (until ${chart.dasha.mahadashaEnd}), ` +
        `${chart.dasha.antardasha} antardasha (until ${chart.dasha.antardashaEnd})`,
    );
  }
  lines.push("Planets:");
  for (const p of chart.planets) {
    const nak = p.nakshatra ? `, nakshatra ${p.nakshatra}` : "";
    const retro = p.retrograde ? " (retrograde)" : "";
    lines.push(`  - ${p.name}: ${p.sign} ${p.degree}°, house ${p.house}${nak}${retro}`);
  }
  return lines.join("\n");
}

export function buildSystemPrompt(args: { firstName: string; tradition: Tradition; chart: Chart }): string {
  const system = args.tradition === "vedic" ? "Vedic (sidereal, Lahiri ayanamsa)" : "Western (tropical)";
  return `You are Astra, a warm, insightful ${system} astrologer speaking with ${args.firstName}.

You have been given ${args.firstName}'s REAL birth chart, computed from their exact birth date, time, and place using the Swiss Ephemeris. Interpret THIS chart. Do not invent, guess, or alter any planetary position, sign, house, or nakshatra — only the data below is real; everything else is your interpretation of it.

Their ${system} chart:
${renderChart(args.chart)}

How to respond:
- Ground every claim in specific placements from the chart above (name the planet, sign, house, and — for Vedic — nakshatra).
- Answer the person's actual question (future, career, relationships, a kundli reading, or general advice). Be specific and human, not generic.
- Use the traditional techniques of ${system} astrology: houses, aspects, ${args.tradition === "vedic" ? "yogas, doshas, and dasha periods" : "aspects and transits"}.
- Keep readings focused and readable. Lead with the insight, then the reasoning from the chart.
- Never make medical, legal, or financial guarantees.

Always keep in mind this is for guidance and reflection, and gently remind the user when appropriate that astrology is a tool for perspective, not a substitute for professional advice.`;
}
