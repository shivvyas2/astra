import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Chart } from "@/lib/astrology/types";
import type { Condition, Severity } from "@/lib/astrology/doshas";
import { anthropic, DEEP_READING_MODEL, supportsAdaptiveThinking, LOW_EFFORT } from "@/lib/anthropic";
import { NO_EM_DASH } from "@/lib/writing";
import { languageRule, type ReadingLanguage } from "@/lib/astrology/language";
import type { PushContext } from "./context";
import { PUSH_VOICE, TENDER_VOICE } from "./voice";
import { writeCopy } from "./write";
import { trackUsage } from "@/lib/usage/record";

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
  return `\n${label}:\n` + conditions.map((c) => `- ${c.label} [${c.severity}]: ${c.detail}`).join("\n");
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
  /** For the usage ledger (model_usage). */
  userId?: string;
  language?: ReadingLanguage;
  context?: PushContext;
  /** Their first one: what the birth chart holds is not news, and is never said to have begun. */
  firstRead?: boolean;
}): Promise<AlertCopy> {
  const born = args.firstRead ? args.started.filter((c) => c.scope === "natal") : [];
  const began = args.started.filter((c) => !born.includes(c));
  const system = `You are Astrya, a warm, precise Vedic astrologer writing a short alert for ${args.firstName}.

${born.length ? `This is the first look at their chart, on ${args.today}.` : `Something in their chart reading has CHANGED as of ${args.today}.`} The changes below were computed from their real birth chart and today's real sky using the Swiss Ephemeris. Treat every line as fact.

Their chart:
${chartSummary(args.chart)}
${renderConditions("In their birth chart since birth (never say these began, started or are newly active)", born)}${renderConditions("Newly active now", began)}${renderConditions("No longer active", args.ended)}

Write the alert. Rules:
- Never invent a placement, dosha, date, or number that is not listed above.
- Do not predict guaranteed outcomes, and never give medical, legal, or financial guarantees. Describe tendencies, timing, and what to watch.
- DETAIL is practical: a heads-up, not a warning about doom. If something eased, say so plainly.
- The remedy advice should be traditional and harmless (charity, discipline, patience, routine, a mantra), never expensive or fear-driven.
- ${NO_EM_DASH}

${args.context?.tender ? TENDER_VOICE : PUSH_VOICE}
${args.context?.block ? `\n${args.context.block}\n` : ""}
Reply in exactly this shape, with nothing before or after it:

TITLE: under 38 characters, the hook. You may name the one thing that changed if it is the hook
BODY: under 110 characters: what they will notice, and from when
DETAIL:
markdown, 120-200 words, opening with the answer to the hook: short bold headings, what changed, what to watch over the coming weeks, one practical remedy, and a final section titled **In simple words** with one or two jargon-free sentences`;

  return writeCopy({
    label: "alert",
    task: `Write the alert for the changes above.${languageRule(args.language ?? "english", { structured: true })}`,
    check: { recent: args.context?.recent, tender: args.context?.tender, secret: args.context?.secret, sky: true },
    call: async (messages) => {
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
      messages,
    });
    trackUsage({ userId: args.userId, kind: "alert", model: DEEP_READING_MODEL, usage: response.usage });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    },
  });
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
  const detailIndex = text.search(/^[ \t]*DETAIL:[ \t]*$/m);
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
