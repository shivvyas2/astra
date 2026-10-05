import type { FactCategory, UserFact } from "@/lib/facts/types";
import { factTopics, topicsForText } from "./topics";
import type { ConversationMemory, Prediction, Topic } from "./types";

/**
 * Which memories a reading is handed, so it is about this person's actual
 * situation without paying to resend everything they ever said.
 *
 * The result has two halves, and the split is what keeps the prompt cache
 * working:
 *
 * - `stable` depends only on what is stored, never on the question: the core
 *   facts of their life, their most recent other conversations, and the
 *   predictions that are due now. It goes in a system block after the cached
 *   chart, so within a conversation it is byte-identical turn to turn and
 *   rides the conversation's cache breakpoint like the v1 facts block did.
 * - `turn` is what this question in particular makes relevant: facts,
 *   summaries and predictions on the topics it names. It is attached to the
 *   newest user message — after the conversation's cache breakpoint — so it
 *   can change every turn without costing the cache anything.
 *
 * Both halves together are held under {@link MEMORY_MAX_TOKENS}.
 */

/** The whole memory — both blocks, guidance included — is held under this. */
export const MEMORY_MAX_TOKENS = 600;
/** Of which the question-specific note gets at most this. */
export const TURN_MAX_TOKENS = 160;
export const STABLE_MAX_TOKENS = MEMORY_MAX_TOKENS - TURN_MAX_TOKENS;

/** The always-on facts: where they work, who they are with, where they live. */
export const CORE_CATEGORIES: FactCategory[] = ["work", "relationships", "home"];
const CORE_PER_CATEGORY = 2;
const RECENT_SUMMARIES = 3;
const DUE_PREDICTIONS = 3;
const TURN_FACTS = 6;
const TURN_SUMMARIES = 2;
const TURN_PREDICTIONS = 3;

/** A prediction is "due" from a month before its window opens until three months after it closes. */
const DUE_LEAD_DAYS = 31;
const DUE_TAIL_DAYS = 92;

/** Roughly four characters to a token for this kind of English. Errs high on purpose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type SelectedMemory = {
  stable: { facts: UserFact[]; summaries: ConversationMemory[]; predictions: Prediction[] };
  turn: { topics: Topic[]; facts: UserFact[]; summaries: ConversationMemory[]; predictions: Prediction[] };
};

export const EMPTY_MEMORY: SelectedMemory = {
  stable: { facts: [], summaries: [], predictions: [] },
  turn: { topics: [], facts: [], summaries: [], predictions: [] },
};

function newest<T extends { updated_at: string }>(a: T, b: T) {
  return b.updated_at.localeCompare(a.updated_at);
}

function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isNaN(t) ? isoDate : new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** Open, and its window is running, about to, or has just closed. */
export function isDue(p: Prediction, today: string): boolean {
  return (
    p.status === "open" && p.window_start <= addDays(today, DUE_LEAD_DAYS) && p.window_end >= addDays(today, -DUE_TAIL_DAYS)
  );
}

export function selectMemory(args: {
  facts: UserFact[];
  memories: ConversationMemory[];
  predictions: Prediction[];
  question: string;
  /** The conversation being continued: its own summary and predictions are already in the history. */
  conversationId?: string | null;
  today: string;
}): SelectedMemory {
  const { today } = args;
  const others = <T extends { conversation_id: string | null }>(rows: T[]) =>
    rows.filter((r) => !args.conversationId || r.conversation_id !== args.conversationId);

  const facts = [...args.facts].sort(newest);
  const coreFacts = CORE_CATEGORIES.flatMap((c) => facts.filter((f) => f.category === c).slice(0, CORE_PER_CATEGORY));

  const memories = others(args.memories).sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  const recent = memories.slice(0, RECENT_SUMMARIES);

  const predictions = others(args.predictions);
  const due = predictions
    .filter((p) => isDue(p, today))
    .sort((a, b) => a.window_end.localeCompare(b.window_end))
    .slice(0, DUE_PREDICTIONS);

  const topics = topicsForText(args.question);
  const onTopic = (ts: Topic[]) => ts.some((t) => topics.includes(t));

  const shownFacts = new Set(coreFacts.map((f) => f.id));
  const turnFacts =
    topics.length === 0 ? [] : facts.filter((f) => !shownFacts.has(f.id) && onTopic(factTopics(f))).slice(0, TURN_FACTS);

  const shownMemories = new Set(recent.map((m) => m.conversation_id));
  const turnSummaries =
    topics.length === 0
      ? []
      : memories.filter((m) => !shownMemories.has(m.conversation_id) && onTopic(m.topics)).slice(0, TURN_SUMMARIES);

  const shownPredictions = new Set(due.map((p) => p.id));
  const turnPredictions =
    topics.length === 0
      ? []
      : predictions
          .filter((p) => !shownPredictions.has(p.id) && topics.includes(p.topic))
          // Open ones first, the soonest first; then what has been settled, newest first.
          .sort((a, b) =>
            a.status === "open" && b.status !== "open"
              ? -1
              : b.status === "open" && a.status !== "open"
                ? 1
                : a.status === "open"
                  ? a.window_end.localeCompare(b.window_end)
                  : b.created_at.localeCompare(a.created_at),
          )
          .slice(0, TURN_PREDICTIONS);

  return {
    stable: { facts: coreFacts, summaries: recent, predictions: due },
    turn: { topics, facts: turnFacts, summaries: turnSummaries, predictions: turnPredictions },
  };
}

/**
 * Takes lines in order while they fit in `budgetChars`. A line that does not
 * fit is skipped rather than cut, and a shorter later one may still go in —
 * the order is the priority.
 */
export function fitLines(lines: string[], budgetChars: number): string[] {
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = line.length + 1;
    if (used + cost > budgetChars) continue;
    out.push(line);
    used += cost;
  }
  return out;
}
