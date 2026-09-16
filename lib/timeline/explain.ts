import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, READING_MODEL, supportsAdaptiveThinking, LOW_EFFORT } from "@/lib/anthropic";
import { eventsHashFor, NOW_LORD, type Timeline } from "./build";

export { eventsHashFor, NOW_LORD };

const within = (date: string, start: string, end: string) => date >= start && date < end;

/** One explanation as it is stored: a period, or the `now` summary. */
export type Explanation = {
  lord: string;
  periodStart: string;
  theme: string;
  meaning: string;
};

export const MAX_THEME = 60;
export const MAX_MEANING = 600;

export function buildExplainSystem(args: { firstName: string; birthDate: string; today: string }): string {
  return `You explain the chapters of ${args.firstName}'s life as Vimshottari dasha divides them, to ${args.firstName} directly.

${args.firstName} was born on ${args.birthDate}. Today is ${args.today}.

Write for someone who has never heard the word dasha and will not be told it. Each period is simply a chapter of their life ruled by one planet.

Rules:
- Second person, warm, concrete. "You" and "your", never "the native".
- Every meaning must say what the chapter tends to be about in ordinary life: work, home, relationships, health, money, learning, family. A planet's keywords on their own are not a meaning.
- A chapter in the past is written in the past tense. The one happening now in the present. A chapter still to come is described as what it tends to bring, never as fate, and never as a warning.
- When ${args.firstName} has pinned a moment inside a chapter, name it and say in one clause how it fits the chapter. Never invent a moment they did not give you.
- No astrology jargon: no "malefic", "benefic", "exalted", "lord", "house", "transit", "dasha", "antardasha". Say "period" or "chapter", and "sub-period" only for the now line.
- No promises, no medical, legal, or financial claims, no flattery.

THEME is under 8 words, a plain phrase for what the chapter is about. MEANING is two to four sentences.

Reply with exactly one line per chapter, in the order given, and then one final line for now. Nothing before or after. Each line is four fields separated by a pipe:

LORD | START | THEME | MEANING

LORD and START are copied exactly from the list. The final line uses the word now as LORD and the sub-period start date as START; its MEANING is where ${args.firstName} is right now: which chapter, which sub-period, and what the coming months ask of them.`;
}

/** The user message: the whole life laid out, with the moments in place. */
export function buildExplainTask(timeline: Timeline): string {
  const lines: string[] = [];
  for (const p of timeline.periods) {
    const state = p.isCurrent ? "now" : p.isPast ? "past" : "ahead";
    lines.push(`${p.lord} | ${p.start} | ${p.start.slice(0, 4)} to ${p.end.slice(0, 4)} (${state})`);
    if (p.isCurrent) {
      const subs = p.antardashas.map((a) => `${a.lord} ${a.start.slice(0, 7)} to ${a.end.slice(0, 7)}`).join("; ");
      lines.push(`  sub-periods: ${subs}`);
    }
    const moments = timeline.events.filter((e) => within(e.occurredOn, p.start, p.end));
    for (const m of moments) {
      const when = m.precision === "year" ? m.occurredOn.slice(0, 4) : m.precision === "month" ? m.occurredOn.slice(0, 7) : m.occurredOn;
      lines.push(`  moment: ${when} · ${m.title}${m.antardasha ? ` (sub-period ${m.antardasha})` : ""}`);
    }
  }
  const now = timeline.now;
  const nowLine = now
    ? `now | ${now.start} | currently the ${now.lord} chapter, ${now.antardasha} sub-period (${now.start.slice(0, 7)} to ${now.end.slice(0, 7)})`
    : "";
  return `The chapters, oldest first:\n\n${lines.join("\n")}\n\n${nowLine}\n\nWrite the lines.`;
}

/**
 * Reads the model's reply against the real timeline.
 *
 * A line is kept only when its lord and start match a period we computed (or
 * the now row), so a hallucinated period can never appear on the map.
 */
export function parseExplanations(text: string, timeline: Timeline): Explanation[] {
  const byKey = new Map<string, string>();
  for (const p of timeline.periods) byKey.set(`${p.lord.toLowerCase()}|${p.start}`, p.lord);
  if (timeline.now) byKey.set(`${NOW_LORD}|${timeline.now.start}`, NOW_LORD);

  const out: Explanation[] = [];
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const p1 = line.indexOf("|");
    const p2 = p1 === -1 ? -1 : line.indexOf("|", p1 + 1);
    const p3 = p2 === -1 ? -1 : line.indexOf("|", p2 + 1);
    if (p3 === -1) continue;

    const lordField = line.slice(0, p1).trim().toLowerCase();
    const start = line.slice(p1 + 1, p2).trim();
    const key = `${lordField}|${start}`;
    const lord = byKey.get(key);
    if (!lord || seen.has(key)) continue;

    const theme = line.slice(p2 + 1, p3).trim().slice(0, MAX_THEME);
    // Everything after the third pipe is the meaning, pipes and all.
    const meaning = line.slice(p3 + 1).trim().slice(0, MAX_MEANING);
    if (!theme || !meaning) continue;

    seen.add(key);
    out.push({ lord, periodStart: start, theme, meaning });
  }
  return out;
}

/** Asks the model to explain the whole life in one call. Empty on failure. */
export async function explainTimeline(args: {
  firstName: string;
  birthDate: string;
  today: string;
  timeline: Timeline;
}): Promise<Explanation[]> {
  try {
    const response = await anthropic().messages.create({
      model: READING_MODEL,
      max_tokens: 3000,
      ...(supportsAdaptiveThinking(READING_MODEL)
        ? { thinking: { type: "adaptive" } as unknown as Anthropic.ThinkingConfigParam }
        : {}),
      ...LOW_EFFORT,
      system: [
        {
          type: "text",
          text: buildExplainSystem({ firstName: args.firstName, birthDate: args.birthDate, today: args.today }),
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [{ role: "user", content: buildExplainTask(args.timeline) }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return parseExplanations(text, args.timeline);
  } catch (err) {
    console.error("timeline explain error", err);
    return [];
  }
}
