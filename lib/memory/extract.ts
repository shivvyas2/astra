import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import type { Db } from "@/lib/supabase/route";
import { FACT_CHANGES_SCHEMA, FACT_RULES, worthReading } from "@/lib/facts/extract";
import { loadFacts, logFactsError } from "@/lib/facts/store";
import { MAX_FACTS, type UserFact } from "@/lib/facts/types";
import { applyMemoryUpdate, parseMemoryUpdate, type AppliedMemory } from "./apply";
import { loadMemory, loadPredictions } from "./store";
import { CONFIDENCES, TOPICS } from "./types";
import { recordUsage } from "@/lib/usage/record";

/**
 * The server's memory pass: after a reading, one cheap call keeps all three
 * kinds of memory current — the standing facts (from what they said), the
 * conversation's rolling summary, and the dated predictions the reading made.
 * One Haiku call per turn, not three.
 *
 * Runs in `after()`, so it never delays a reading, and never throws, so it can
 * never break one. Skipped entirely on a turn whose memory the iPhone already
 * worked out on-device (`memory: "on-device"` on the chat request), and when
 * none of the memory tables exist yet.
 */
export const MEMORY_MODEL = "claude-haiku-4-5";

const MAX_MESSAGE_CHARS = 4000;
const MAX_REPLY_CHARS = 4000;
const MAX_PREVIOUS_REPLY_CHARS = 600;

/** The reply's shape. Structured outputs guarantee it; {@link parseMemoryUpdate} still checks every value. */
export const MEMORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["facts", "summary", "topics", "predictions"],
  properties: {
    facts: FACT_CHANGES_SCHEMA,
    summary: { type: "string" },
    topics: { type: "array", items: { type: "string", enum: [...TOPICS] } },
    predictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "topic", "window_start", "window_end", "confidence"],
        properties: {
          claim: { type: "string" },
          topic: { type: "string", enum: [...TOPICS] },
          window_start: { type: "string" },
          window_end: { type: "string" },
          confidence: { type: "string", enum: [...CONFIDENCES] },
        },
      },
    },
  },
} as const;

export function buildMemoryExtractionSystem(args: { today: string; readFacts: boolean }): string {
  const facts = args.readFacts
    ? FACT_RULES
    : "The newest message says nothing about their own life. Return three empty lists.";
  return `You keep an astrologer's notes about one person, so later readings remember their life, what was discussed, and what was predicted.

Today is ${args.today}.

You are given the facts already on file (each with an id), the summary of this conversation so far, the person's newest message, and the astrologer's reply to it. Return four things.

1. facts: changes to the standing facts about the person's own life.
${facts}

2. summary: the whole conversation so far, rewritten to include the newest exchange. What they asked about, what the astrologer concluded with its dated windows, and anything left open. Two or three plain sentences, under 80 words, in the third person ("Asked whether to change jobs; told..."). Name at most the one placement or period a conclusion rests on.

3. topics: up to four from the list, for what the whole conversation is about.

4. predictions: each dated prediction the astrologer's newest reply commits to: something concrete that will or will not happen to the person within a window of months.
- claim: one plain sentence about the event, addressed to them, without the astrology ("A job offer from outside your current company").
- window_start and window_end: months as yyyy-mm, from the reply. A single month is the same month twice. Without a dated window it is not a prediction; leave it out.
- confidence: the word the reply used, likely, possible or unlikely. If it used none, possible.
- topic: from the list.
- Leave out advice, descriptions of character, and what the planets do. Only the newest reply. Most replies have zero to three.`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildMemoryExtractionInput(args: {
  existing: Pick<UserFact, "id" | "fact" | "category">[];
  readFacts: boolean;
  summary: string | null;
  previousReply?: string | null;
  message: string;
  reply: string;
}): string {
  const parts: string[] = [];
  if (args.readFacts) {
    const list =
      args.existing.length > 0
        ? args.existing.map((f) => `[${f.id}] (${f.category}) ${oneLine(f.fact)}`).join("\n")
        : "(none yet)";
    parts.push(`FACTS ON FILE:\n${list}`);
    if (args.previousReply) {
      parts.push(
        `THE ASTROLOGER'S PREVIOUS REPLY (context for a short answer, never a source of facts):\n${oneLine(args.previousReply).slice(0, MAX_PREVIOUS_REPLY_CHARS)}`,
      );
    }
  }
  parts.push(`THIS CONVERSATION SO FAR:\n${args.summary ? oneLine(args.summary) : "(just started)"}`);
  parts.push(`THEIR NEWEST MESSAGE:\n${args.message.trim().slice(0, MAX_MESSAGE_CHARS)}`);
  parts.push(
    `THE ASTROLOGER'S REPLY (source of the summary and the predictions, never of facts):\n${args.reply.trim().slice(0, MAX_REPLY_CHARS)}`,
  );
  return parts.join("\n\n");
}

/** The structured-output request param. Postdates the installed SDK's types, like LOW_EFFORT. */
const JSON_OUTPUT = {
  output_config: { format: { type: "json_schema", schema: MEMORY_SCHEMA } },
} as const;

/** Asks the model. The parsed JSON, or null on a cut-off, a non-JSON reply, or any failure upstream. */
export async function proposeMemory(args: {
  today: string;
  readFacts: boolean;
  input: string;
  /** For the usage ledger (model_usage). */
  userId?: string;
  conversationId?: string;
}): Promise<unknown | null> {
  const response = await anthropic().messages.create({
    model: MEMORY_MODEL,
    max_tokens: 1500,
    ...JSON_OUTPUT,
    system: buildMemoryExtractionSystem({ today: args.today, readFacts: args.readFacts }),
    messages: [{ role: "user", content: args.input }],
  });
  const usage = response.usage;
  console.log(`memory usage model=${MEMORY_MODEL} in=${usage.input_tokens} out=${usage.output_tokens}`);
  // Already running after the response (in `after()`), so awaiting costs no one anything.
  await recordUsage({ userId: args.userId, kind: "memory", model: MEMORY_MODEL, usage, conversationId: args.conversationId });
  if (response.stop_reason !== "end_turn") return null;
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The whole server pass for one turn: load what is remembered, ask once,
 * validate, write. Never throws; null when nothing was asked or the model
 * failed.
 */
export async function rememberTurn(args: {
  db: Db;
  userId: string;
  conversationId: string;
  message: string;
  reply: string;
  previousReply?: string | null;
  today: string;
}): Promise<AppliedMemory | null> {
  try {
    if (!args.reply.trim()) return null;
    const [factsLoad, memoryLoad, predictionsLoad] = await Promise.all([
      // A little over the cap, so a list that somehow grew past it is trimmed.
      loadFacts(args.db, MAX_FACTS + 20),
      loadMemory(args.db, args.conversationId),
      loadPredictions(args.db, 100),
    ]);
    const available = {
      facts: factsLoad.available,
      memories: memoryLoad.available,
      predictions: predictionsLoad.available,
    };
    if (!available.facts && !available.memories && !available.predictions) return null;

    const readFacts = available.facts && worthReading(args.message, args.previousReply);
    const raw = await proposeMemory({
      today: args.today,
      readFacts,
      userId: args.userId,
      conversationId: args.conversationId,
      input: buildMemoryExtractionInput({
        existing: factsLoad.facts,
        readFacts,
        summary: memoryLoad.memory?.summary ?? null,
        previousReply: args.previousReply,
        message: args.message,
        reply: args.reply,
      }),
    });
    if (raw === null) return null;

    const { update } = parseMemoryUpdate(raw, {
      existingFactIds: new Set(readFacts ? factsLoad.facts.map((f) => f.id) : []),
      today: args.today,
    });
    // Facts were not asked for, so any that came back anyway are not used.
    if (!readFacts) update.facts = { add: [], update: [], remove: [] };

    return await applyMemoryUpdate(args.db, {
      userId: args.userId,
      conversationId: args.conversationId,
      update,
      existingFacts: factsLoad.facts,
      existingPredictions: predictionsLoad.predictions,
      available,
      source: "chat",
    });
  } catch (err) {
    logFactsError("memory pass", err);
    return null;
  }
}
