import type { Db } from "@/lib/supabase/route";
import { isDuplicateFact } from "@/lib/facts/extract";
import {
  MAX_OPEN_PREDICTIONS,
  MAX_PREDICTIONS_PER_TURN,
  cleanTopics,
  isConfidence,
  isPredictionStatus,
  isTopic,
  type ConversationMemory,
  type NewPrediction,
  type Prediction,
  type PredictionStatus,
  type Topic,
} from "./types";

/**
 * Reads and writes of `conversation_memories` and `predictions`, always
 * through the caller's own Supabase client so RLS decides what is visible.
 *
 * Same contract as lib/facts/store.ts, for the same reason — production lags
 * the repo by migrations and main deploys on every push: nothing here throws,
 * a missing table reads as empty, and a failed write returns false.
 */

type PgError = { code?: string; message?: string } | null | undefined;

export type MemoryTable = "conversation_memories" | "predictions";

/** A table (42P01, PGRST205) or column (42703, PGRST204) that has not been created yet. */
export function isMissingRelation(error: PgError): boolean {
  if (!error) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "")) return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

const missingLogged = new Set<MemoryTable>();

/** Logs a failure; a missing table once per table per server instance. */
export function logMemoryError(table: MemoryTable, where: string, error: unknown): void {
  if (isMissingRelation(error as PgError)) {
    if (missingLogged.has(table)) return;
    missingLogged.add(table);
    console.warn(`${table} table missing (${where}); it is off until migration 0009 is applied`);
    return;
  }
  console.error(`${table} ${where} error`, error);
}

export function resetMemoryLogForTests(): void {
  missingLogged.clear();
}

/** What a delete or a status change came to. "missing" means the table is not there: nothing to change. */
export type WriteOutcome = "ok" | "missing" | "error";

function outcome(table: MemoryTable, where: string, error: PgError): WriteOutcome {
  if (!error) return "ok";
  logMemoryError(table, where, error);
  return isMissingRelation(error) ? "missing" : "error";
}

// MARK: - Conversation summaries

function toMemory(row: Record<string, unknown>): ConversationMemory | null {
  if (typeof row?.conversation_id !== "string" || typeof row?.summary !== "string") return null;
  return {
    conversation_id: row.conversation_id,
    summary: row.summary,
    topics: cleanTopics(row.topics),
    last_message_at: typeof row.last_message_at === "string" ? row.last_message_at : "",
  };
}

const MEMORY_COLUMNS = "conversation_id, summary, topics, last_message_at";

/** The caller's conversation summaries, most recent first. Never throws. */
export async function loadMemories(
  db: Db,
  limit = 12,
): Promise<{ memories: ConversationMemory[]; available: boolean }> {
  try {
    const { data, error } = await db
      .from("conversation_memories")
      .select(MEMORY_COLUMNS)
      .order("last_message_at", { ascending: false })
      .limit(limit);
    if (error) {
      logMemoryError("conversation_memories", "read", error);
      return { memories: [], available: !isMissingRelation(error) };
    }
    const memories = ((data ?? []) as Record<string, unknown>[])
      .map(toMemory)
      .filter((m): m is ConversationMemory => m !== null);
    return { memories, available: true };
  } catch (err) {
    logMemoryError("conversation_memories", "read", err);
    return { memories: [], available: true };
  }
}

/** One conversation's summary, or null. Never throws. */
export async function loadMemory(
  db: Db,
  conversationId: string,
): Promise<{ memory: ConversationMemory | null; available: boolean }> {
  try {
    const { data, error } = await db
      .from("conversation_memories")
      .select(MEMORY_COLUMNS)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error) {
      logMemoryError("conversation_memories", "read one", error);
      return { memory: null, available: !isMissingRelation(error) };
    }
    return { memory: data ? toMemory(data as Record<string, unknown>) : null, available: true };
  } catch (err) {
    logMemoryError("conversation_memories", "read one", err);
    return { memory: null, available: true };
  }
}

/** Writes (or replaces) a conversation's summary as the user. False on any failure. */
export async function saveMemory(
  db: Db,
  args: { userId: string; conversationId: string; summary: string; topics: Topic[]; now?: string },
): Promise<boolean> {
  const now = args.now ?? new Date().toISOString();
  try {
    const { error } = await db.from("conversation_memories").upsert(
      {
        conversation_id: args.conversationId,
        user_id: args.userId,
        summary: args.summary,
        topics: args.topics,
        last_message_at: now,
        updated_at: now,
      },
      { onConflict: "conversation_id" },
    );
    if (error) {
      logMemoryError("conversation_memories", "write", error);
      return false;
    }
    return true;
  } catch (err) {
    logMemoryError("conversation_memories", "write", err);
    return false;
  }
}

export async function deleteMemory(db: Db, userId: string, conversationId: string): Promise<WriteOutcome> {
  try {
    const { error } = await db
      .from("conversation_memories")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    return outcome("conversation_memories", "delete", error);
  } catch (err) {
    logMemoryError("conversation_memories", "delete", err);
    return "error";
  }
}

// MARK: - Predictions

function toPrediction(row: Record<string, unknown>): Prediction | null {
  if (
    typeof row?.id !== "string" ||
    typeof row?.claim !== "string" ||
    typeof row?.window_start !== "string" ||
    typeof row?.window_end !== "string" ||
    !isTopic(row.topic) ||
    !isConfidence(row.confidence) ||
    !isPredictionStatus(row.status)
  ) {
    return null;
  }
  return {
    id: row.id,
    conversation_id: typeof row.conversation_id === "string" ? row.conversation_id : null,
    topic: row.topic,
    claim: row.claim,
    window_start: row.window_start.slice(0, 10),
    window_end: row.window_end.slice(0, 10),
    confidence: row.confidence,
    status: row.status,
    checked_at: typeof row.checked_at === "string" ? row.checked_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

const PREDICTION_COLUMNS =
  "id, conversation_id, topic, claim, window_start, window_end, confidence, status, checked_at, created_at";

/** The caller's predictions, newest first. Never throws. */
export async function loadPredictions(
  db: Db,
  limit = 100,
): Promise<{ predictions: Prediction[]; available: boolean }> {
  try {
    const { data, error } = await db
      .from("predictions")
      .select(PREDICTION_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      logMemoryError("predictions", "read", error);
      return { predictions: [], available: !isMissingRelation(error) };
    }
    const predictions = ((data ?? []) as Record<string, unknown>[])
      .map(toPrediction)
      .filter((p): p is Prediction => p !== null);
    return { predictions, available: true };
  } catch (err) {
    logMemoryError("predictions", "read", err);
    return { predictions: [], available: true };
  }
}

function overlaps(a: { window_start: string; window_end: string }, b: { window_start: string; window_end: string }) {
  return a.window_start <= b.window_end && b.window_start <= a.window_end;
}

/**
 * The predictions from one turn worth storing: not a restatement of one
 * already open on the same topic over an overlapping window, not a repeat
 * within the turn, at most {@link MAX_PREDICTIONS_PER_TURN}, and none once
 * the user already has {@link MAX_OPEN_PREDICTIONS} open.
 */
export function planPredictionWrites(existing: Prediction[], candidates: NewPrediction[]): NewPrediction[] {
  const open = existing.filter((p) => p.status === "open");
  const room = Math.max(0, Math.min(MAX_PREDICTIONS_PER_TURN, MAX_OPEN_PREDICTIONS - open.length));
  const out: NewPrediction[] = [];
  for (const c of candidates) {
    if (out.length >= room) break;
    const same = (p: NewPrediction) => p.topic === c.topic && overlaps(p, c) && isDuplicateFact(p.claim, c.claim);
    if (open.some(same) || out.some(same)) continue;
    out.push(c);
  }
  return out;
}

export async function insertPredictions(
  db: Db,
  args: { userId: string; conversationId: string | null; predictions: NewPrediction[] },
): Promise<boolean> {
  if (args.predictions.length === 0) return true;
  try {
    const { error } = await db.from("predictions").insert(
      args.predictions.map((p) => ({
        user_id: args.userId,
        conversation_id: args.conversationId,
        topic: p.topic,
        claim: p.claim,
        window_start: p.window_start,
        window_end: p.window_end,
        confidence: p.confidence,
      })),
    );
    if (error) {
      logMemoryError("predictions", "insert", error);
      return false;
    }
    return true;
  } catch (err) {
    logMemoryError("predictions", "insert", err);
    return false;
  }
}

/** "Did it happen?" — records the answer, or reopens it. */
export async function setPredictionStatus(
  db: Db,
  args: { userId: string; id: string; status: PredictionStatus; now?: string },
): Promise<WriteOutcome> {
  try {
    const { error } = await db
      .from("predictions")
      .update({ status: args.status, checked_at: args.status === "open" ? null : (args.now ?? new Date().toISOString()) })
      .eq("id", args.id)
      .eq("user_id", args.userId);
    return outcome("predictions", "status", error);
  } catch (err) {
    logMemoryError("predictions", "status", err);
    return "error";
  }
}

export async function deletePrediction(db: Db, userId: string, id: string): Promise<WriteOutcome> {
  try {
    const { error } = await db.from("predictions").delete().eq("id", id).eq("user_id", userId);
    return outcome("predictions", "delete", error);
  } catch (err) {
    logMemoryError("predictions", "delete", err);
    return "error";
  }
}
