import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, READING_MODEL, supportsAdaptiveThinking, LOW_EFFORT } from "@/lib/anthropic";

/** A moment proposed from the user's own words, awaiting their confirmation. */
export type CandidateEvent = {
  occurredOn: string; // ISO date, always a real day
  precision: "day" | "month" | "year";
  title: string;
};

/** What the user has said to us, oldest first. */
export type Utterance = { content: string; createdAt: string };

const MAX_TITLE = 120;

export function buildExtractionSystem(args: { birthDate: string; today: string }): string {
  return `You read a person's messages to their astrologer and pull out the real, dated events of their life.

Their birth date is ${args.birthDate}. Today is ${args.today}.

You are looking for things that HAPPENED to this person and can be placed in time: a job started or lost, a move, a marriage or separation, a birth, a death, an illness or recovery, a graduation, a business begun or closed, a relationship that began or ended.

Rules:
- Only include an event the person states about their own life. Never infer one from a question they asked, from a hypothetical, or from something you read in an astrological reading.
- Only include an event you can date to at least a year, from what they wrote. If they said "a few years ago" with no anchor, skip it.
- Every date must fall between ${args.birthDate} and ${args.today}. Skip anything outside that.
- Write the title in the person's own framing, under 12 words, no astrology in it. "Left the job in Chicago", not "Career upheaval under Saturn".
- Do not repeat the same event twice, even if they mentioned it more than once.
- If you find nothing that qualifies, reply with the single word NONE.

Reply with one event per line and nothing else. Each line is three fields separated by a pipe:

DATE | PRECISION | TITLE

DATE is YYYY-MM-DD, YYYY-MM, or YYYY — whichever precision they actually gave you.
PRECISION is day, month, or year, matching DATE.
TITLE is the short description. It must not contain a pipe.

Example of the shape:
2019-11 | month | Left the job at the agency
2022 | year | Started the business with my brother`;
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
  const out: CandidateEvent[] = [];
  const seen = new Set<string>();

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.toUpperCase() === "NONE") continue;

    // Split on the first two pipes only. Everything after the second is the
    // title, kept verbatim — splitting on every pipe and rejoining would eat
    // the spacing of a title that happens to contain one.
    const firstPipe = line.indexOf("|");
    const secondPipe = line.indexOf("|", firstPipe + 1);
    if (firstPipe === -1 || secondPipe === -1) continue;
    const dateField = line.slice(0, firstPipe).trim();
    const precisionField = line.slice(firstPipe + 1, secondPipe).trim();

    const resolved = resolveDate(dateField);
    if (!resolved) continue;
    if (resolved.occurredOn < bounds.birthDate || resolved.occurredOn > bounds.today) continue;

    // The PRECISION field is read but not trusted: the date's own shape is the
    // real evidence. A model that writes "2019 | day | ..." does not know the
    // day, whatever it claims in the second field.
    void precisionField;
    const precision = resolved.precision;

    const title = line.slice(secondPipe + 1).trim().slice(0, MAX_TITLE);
    if (!title) continue;

    const key = `${resolved.occurredOn}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ occurredOn: resolved.occurredOn, precision, title });
  }

  return out.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
}

/**
 * Turns a partial date into a real one.
 *
 * A month- or year-precision event is anchored to the first day of the period.
 * The precision travels with it, so the UI can draw the marker softly rather
 * than implying we know the day.
 */
function resolveDate(field: string): { occurredOn: string; precision: CandidateEvent["precision"] } | null {
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
