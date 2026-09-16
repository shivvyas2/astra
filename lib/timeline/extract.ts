import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, READING_MODEL, supportsAdaptiveThinking, LOW_EFFORT } from "@/lib/anthropic";

/** A moment proposed from the user's own words, awaiting their confirmation. */
export type CandidateEvent = {
  /** ISO date, always a real day; null when the event could not be dated. */
  occurredOn: string | null;
  precision: "day" | "month" | "year" | "unknown";
  title: string;
  /** The user's own words this came from, so they can check it. */
  evidence: string;
};

/** What the user has said to us, oldest first. */
export type Utterance = { content: string; createdAt: string };

const MAX_TITLE = 120;
const MAX_EVIDENCE = 160;

export function buildExtractionSystem(args: { birthDate: string; today: string }): string {
  return `You read a person's messages to their astrologer and pull out the real, dated events of their life.

Their birth date is ${args.birthDate}. Today is ${args.today}.

You are looking for things that HAPPENED to this person and can be placed in time: a job started or lost, a move, a marriage or separation, a birth, a death, an illness or recovery, a graduation, a business begun or closed, a relationship that began or ended.

Each message is prefixed with the date it was written, in square brackets. Use it.

Rules:
- Only include an event the person states about their own life. Never infer one from a question they asked, from a hypothetical, or from something you read in an astrological reading.
- Date each event from what they wrote, as precisely as they gave it and no more:
  - An explicit date or month is used as given.
  - A relative phrase is resolved from the message date. "Last March" in a message written 2025-06-10 is 2024-03, month precision. "Two years ago" in a 2025 message is 2023, year precision. "Last week" is the message month, month precision.
  - An age is resolved from the birth date. "When I was 25" is the birth year plus 25, year precision.
  - "Recently" or "just" with no other anchor is the message month, month precision.
- If the event is clear but cannot be dated even to a year, keep it and write ? for the date. Do not guess a year.
- Every resolved date must fall between ${args.birthDate} and ${args.today}. Skip anything outside that.
- Write the title in the person's own framing, under 12 words, no astrology in it. "Left the job in Chicago", not "Career upheaval under Saturn".
- Quote the words that told you, verbatim, under 20 words, as EVIDENCE.
- Do not repeat the same event twice, even if they mentioned it more than once.
- If you find nothing that qualifies, reply with the single word NONE.

Reply with one event per line and nothing else. Each line is four fields separated by a pipe:

DATE | PRECISION | TITLE | EVIDENCE

DATE is YYYY-MM-DD, YYYY-MM, YYYY, or ? — whichever precision they actually gave you.
PRECISION is day, month, year, or unknown, matching DATE.
TITLE is the short description. It must not contain a pipe.
EVIDENCE is the quote. It must not contain a pipe.

Example of the shape:
2019-11 | month | Left the job at the agency | I quit the agency job in November 2019
2022 | year | Started the business with my brother | my brother and I started our company two years ago
? | unknown | Father passed away | since my father passed I have felt lost`;
}

/**
 * Reads the model's reply.
 *
 * Pipe-delimited lines rather than JSON, for the reason recorded in
 * `lib/alerts/compose.ts`: the model reliably breaks JSON string escaping and
 * the whole reply is lost, where a malformed line here costs one event.
 *
 * Everything is re-validated against the birth date and today regardless of
 * what the prompt asked for — a date outside a person's life is the one error
 * that would be visibly absurd on the timeline.
 */
export function parseExtractedEvents(
  text: string,
  bounds: { birthDate: string; today: string },
): CandidateEvent[] {
  const dated: CandidateEvent[] = [];
  const undated: CandidateEvent[] = [];
  const seen = new Set<string>();

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.toUpperCase() === "NONE") continue;

    // Split on the first three pipes only. The title sits between the second
    // and third, and everything after the third is the evidence, kept
    // verbatim. A reply in the older three-field shape still parses: the
    // title runs to the end and the evidence is empty.
    const p1 = line.indexOf("|");
    const p2 = p1 === -1 ? -1 : line.indexOf("|", p1 + 1);
    if (p1 === -1 || p2 === -1) continue;
    const p3 = line.indexOf("|", p2 + 1);
    const dateField = line.slice(0, p1).trim();
    const precisionField = line.slice(p1 + 1, p2).trim();
    const title = (p3 === -1 ? line.slice(p2 + 1) : line.slice(p2 + 1, p3)).trim().slice(0, MAX_TITLE);
    const evidence = (p3 === -1 ? "" : line.slice(p3 + 1)).trim().slice(0, MAX_EVIDENCE);
    if (!title) continue;

    if (dateField === "?") {
      // Kept rather than dropped: the user knows the year even when their
      // messages never said it, and the confirmation screen asks them.
      const key = `?:${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      undated.push({ occurredOn: null, precision: "unknown", title, evidence });
      continue;
    }

    const resolved = resolveDate(dateField);
    if (!resolved) continue;
    if (resolved.occurredOn < bounds.birthDate || resolved.occurredOn > bounds.today) continue;

    // The PRECISION field is read but not trusted: the date's own shape is the
    // real evidence. A model that writes "2019 | day | ..." does not know the
    // day, whatever it claims in the second field.
    void precisionField;

    const key = `${resolved.occurredOn}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    dated.push({ occurredOn: resolved.occurredOn, precision: resolved.precision, title, evidence });
  }

  dated.sort((a, b) => a.occurredOn!.localeCompare(b.occurredOn!));
  return [...dated, ...undated];
}

/**
 * Turns a partial date into a real one.
 *
 * A month- or year-precision event is anchored to the first day of the period.
 * The precision travels with it, so the UI can draw the marker softly rather
 * than implying we know the day.
 */
function resolveDate(field: string): { occurredOn: string; precision: "day" | "month" | "year" } | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(field);
  if (day) return isRealDate(field) ? { occurredOn: field, precision: "day" } : null;

  const month = /^(\d{4})-(\d{2})$/.exec(field);
  if (month) {
    const iso = `${field}-01`;
    return isRealDate(iso) ? { occurredOn: iso, precision: "month" } : null;
  }

  const year = /^(\d{4})$/.exec(field);
  if (year) {
    const iso = `${field}-01-01`;
    return isRealDate(iso) ? { occurredOn: iso, precision: "year" } : null;
  }

  return null;
}

function isRealDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Caps how much history goes to the model.
 *
 * Long-running users have thousands of messages; the events are almost always
 * in what they volunteered, which is not evenly distributed. Oldest-first keeps
 * the early "here's my situation" messages, which is where most life history
 * gets told.
 */
export function selectTranscript(utterances: Utterance[], maxChars = 24_000): string {
  const lines: string[] = [];
  let used = 0;
  for (const u of utterances) {
    // Measured on the message itself, not the stamped line — the date prefix
    // is 13 characters and would make "ok" look substantial.
    const content = u.content.replace(/\s+/g, " ").trim();
    if (content.length < 12) continue;
    const line = `[${u.createdAt.slice(0, 10)}] ${content}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length;
  }
  return lines.join("\n");
}

/** Mines the user's own messages for datable life events. */
export async function extractLifeEvents(args: {
  birthDate: string;
  today: string;
  utterances: Utterance[];
}): Promise<CandidateEvent[]> {
  const transcript = selectTranscript(args.utterances);
  if (!transcript) return [];

  try {
    const response = await anthropic().messages.create({
      model: READING_MODEL,
      max_tokens: 2000,
      ...(supportsAdaptiveThinking(READING_MODEL)
        ? { thinking: { type: "adaptive" } as unknown as Anthropic.ThinkingConfigParam }
        : {}),
      ...LOW_EFFORT,
      system: buildExtractionSystem({ birthDate: args.birthDate, today: args.today }),
      messages: [
        {
          role: "user",
          content: `Here is everything they have written to me, oldest first.\n\n${transcript}`,
        },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return parseExtractedEvents(text, { birthDate: args.birthDate, today: args.today });
  } catch (err) {
    console.error("life event extraction error", err);
    // An empty result is correct here: the user is offered manual pinning and
    // the scan can be retried. A thrown error would block the timeline itself.
    return [];
  }
}
