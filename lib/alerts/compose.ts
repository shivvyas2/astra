import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Chart } from "@/lib/astrology/types";
import type { Condition, Severity } from "@/lib/astrology/doshas";
import { anthropic, DEEP_READING_MODEL, supportsAdaptiveThinking, LOW_EFFORT } from "@/lib/anthropic";

export type AlertCopy = {
  title: string;
  body: string;
  detail: string;
};

function chartSummary(chart: Chart): string {
  const lines = [
    `Ascendant: ${chart.ascendant.sign} ${chart.ascendant.degree}°`,
    `Sun: ${chart.sunSign} | Moon: ${chart.moonSign}`,
  ];
  if (chart.dasha) {
    lines.push(
      `Vimshottari: ${chart.dasha.mahadasha} mahadasha until ${chart.dasha.mahadashaEnd}, ` +
        `${chart.dasha.antardasha} antardasha until ${chart.dasha.antardashaEnd}`,
    );
  }
  lines.push("Planets: " + chart.planets.map((p) => `${p.name} ${p.sign} h${p.house}${p.retrograde ? " R" : ""}`).join(", "));
  return lines.join("\n");
}

function renderConditions(label: string, conditions: Condition[]): string {
  if (conditions.length === 0) return "";
  return `\n${label}:\n` + conditions.map((c) => `- ${c.label} [${c.severity}] — ${c.detail}`).join("\n");
}

/**
 * Writes the notification a user actually reads.
 *
 * The doshas themselves are decided in code, deterministically; the model's
 * only job is to say what the change means and what to do about it, using the
 * facts it is handed. That split keeps the astrology honest — the model is
 * never the thing deciding whether a dosha exists.
 */
export async function composeAlert(args: {
  firstName: string;
  chart: Chart;
  today: string;
  started: Condition[];
  ended: Condition[];
  severity: Severity;
}): Promise<AlertCopy> {
  const system = `You are Sanchara, a warm, precise Vedic astrologer writing a short alert for ${args.firstName}.

Something in their chart reading has CHANGED as of ${args.today}. The changes below were computed from their real birth chart and today's real sky using the Swiss Ephemeris. Treat every line as fact.

Their chart:
${chartSummary(args.chart)}
${renderConditions("Newly active now", args.started)}${renderConditions("No longer active", args.ended)}

Write the alert. Rules:
- Never invent a placement, dosha, date, or number that is not listed above.
- Do not predict guaranteed outcomes, and never give medical, legal, or financial guarantees. Describe tendencies, timing, and what to watch.
- Be calm and practical. This is a heads-up, not a warning about doom. If something eased, say so plainly.
- The remedy advice should be traditional and harmless (charity, discipline, patience, routine, a mantra), never expensive or fear-driven.

Reply in exactly this shape, with nothing before or after it:

TITLE: under 38 characters, names what changed
BODY: under 140 characters, one plain sentence a person reads on a lock screen
DETAIL:
markdown, 120-200 words: short bold headings, what changed, what to watch over the coming weeks, one practical remedy, and a final section titled **In simple words** with one or two jargon-free sentences`;

  try {
    const response = await anthropic().messages.create({
      model: DEEP_READING_MODEL,
      // An alert is a title, a sentence, and ~180 words. This runs once per
      // user per day, so the thinking budget is kept short deliberately.
      max_tokens: 1600,
      ...(supportsAdaptiveThinking(DEEP_READING_MODEL)
        ? { thinking: { type: "adaptive" } as unknown as Anthropic.ThinkingConfigParam }
        : {}),
      ...LOW_EFFORT,
      system,
      messages: [
        {
          role: "user",
          content: "Write the alert for the changes above.",
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = parseAlertCopy(text);
    if (parsed) return parsed;
    console.error("alert compose: unparseable model output");
  } catch (err) {
    console.error("alert compose error", err);
  }

  return fallbackCopy(args.started, args.ended);
}

/**
 * Reads the model's reply.
 *
 * The delimited shape is used rather than JSON because `detail` is markdown:
 * asked for JSON, the model sometimes writes real newlines inside the string,
 * which is not valid JSON, and the reply is lost. Measured on a batch of seven
 * live readings, two came back that way. Line-delimited text has no escaping to
 * get wrong. JSON is still accepted, for replies that arrive in the old shape.
 */
export function parseAlertCopy(text: string): AlertCopy | null {
  const title = text.match(/^\s*TITLE:\s*(.+)$/m)?.[1]?.trim();
  const body = text.match(/^\s*BODY:\s*(.+)$/m)?.[1]?.trim();
  const detailIndex = text.search(/^\s*DETAIL:\s*$/m);
  const detail =
    detailIndex === -1
      ? undefined
      : text.slice(text.indexOf("\n", detailIndex) + 1).trim();

  if (title && body && detail) {
    return { title: title.slice(0, 60), body: body.slice(0, 200), detail };
  }
  return parseAlertJson(text);
}

/** The older JSON shape, kept so a reply in either form still lands. */
export function parseAlertJson(text: string): AlertCopy | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Partial<AlertCopy>;
    if (!raw.title?.trim() || !raw.body?.trim() || !raw.detail?.trim()) return null;
    return {
      title: raw.title.trim().slice(0, 60),
      body: raw.body.trim().slice(0, 200),
      detail: raw.detail.trim(),
    };
  } catch {
    return null;
  }
}

/** Used when the model call fails, so an alert still reaches the user. */
export function fallbackCopy(started: Condition[], ended: Condition[]): AlertCopy {
  const primary = started[0] ?? ended[0];
  const startedNames = started.map((c) => c.label).join(", ");
  const endedNames = ended.map((c) => c.label).join(", ");
  const title = started.length > 0 ? `${primary.label} is active` : `${primary.label} has eased`;
  const body =
    started.length > 0
      ? `${startedNames} now shows in your chart. Open Sanchara for the reading.`
      : `${endedNames} has passed. Open Sanchara for the reading.`;
  const detail = [
    started.length > 0 ? `**Now active**\n${started.map((c) => `- ${c.label}: ${c.detail}`).join("\n")}` : "",
    ended.length > 0 ? `**Eased**\n${ended.map((c) => `- ${c.label}: ${c.detail}`).join("\n")}` : "",
    "**In simple words**\nSomething in your chart shifted today. Ask Sanchara about it for the full reading.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { title: title.slice(0, 60), body: body.slice(0, 200), detail };
}
