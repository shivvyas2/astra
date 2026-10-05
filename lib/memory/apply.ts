import type { Db } from "@/lib/supabase/route";
import { parseFactChanges, planFactWrites, type FactChanges } from "@/lib/facts/extract";
import { applyFactPlan, isEmptyPlan, type FactPlan } from "@/lib/facts/store";
import type { FactSource, UserFact } from "@/lib/facts/types";
import { insertPredictions, planPredictionWrites, saveMemory } from "./store";
import { cleanPrediction, cleanSummary, cleanTopics, type NewPrediction, type Prediction, type Topic } from "./types";

/**
 * One turn's worth of memory — fact changes, the conversation's new summary,
 * and the predictions the reading made — validated and written.
 *
 * Both writers come through here: the server's Haiku pass
 * (lib/memory/extract.ts) and the iPhone's on-device model
 * (POST /api/memory/ingest). Neither is trusted: every item is re-checked
 * against the same rules, fact ids must be the caller's own, and nothing that
 * reads as astrology is stored as a fact about their life.
 */

export type MemoryUpdate = {
  facts: FactChanges;
  summary: string | null;
  topics: Topic[];
  predictions: NewPrediction[];
};

/** Validates a proposed update item by item. `rejected` counts what was dropped. */
export function parseMemoryUpdate(
  raw: unknown,
  ctx: { existingFactIds: ReadonlySet<string>; today: string },
): { update: MemoryUpdate; rejected: number } {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const factsRaw = obj.facts && typeof obj.facts === "object" ? (obj.facts as Record<string, unknown>) : {};
  const facts = parseFactChanges(factsRaw, ctx.existingFactIds);
  const proposed = (key: string) => (Array.isArray(factsRaw[key]) ? (factsRaw[key] as unknown[]).length : 0);
  let rejected =
    proposed("add") - facts.add.length + proposed("update") - facts.update.length + proposed("remove") - facts.remove.length;

  const summary = obj.summary === undefined || obj.summary === null || obj.summary === "" ? null : cleanSummary(obj.summary);
  if (summary === null && typeof obj.summary === "string" && obj.summary.trim() !== "") rejected++;

  const predictionsRaw = Array.isArray(obj.predictions) ? obj.predictions : [];
  const predictions: NewPrediction[] = [];
  for (const p of predictionsRaw) {
    const clean = cleanPrediction(p, ctx.today);
    if (clean) predictions.push(clean);
    else rejected++;
  }

  return { update: { facts, summary, topics: cleanTopics(obj.topics), predictions }, rejected };
}

export type AppliedMemory = {
  facts: FactPlan | null;
  summary: boolean;
  predictions: NewPrediction[];
};

/**
 * Writes an already-validated update as the user. Each part is written only
 * when its table exists (`available`), and a failure in one never stops the
 * others. Never throws.
 */
export async function applyMemoryUpdate(
  db: Db,
  args: {
    userId: string;
    conversationId: string;
    update: MemoryUpdate;
    existingFacts: UserFact[];
    existingPredictions: Prediction[];
    available: { facts: boolean; memories: boolean; predictions: boolean };
    source: FactSource;
  },
): Promise<AppliedMemory> {
  const { update, available } = args;
  const result: AppliedMemory = { facts: null, summary: false, predictions: [] };

  if (available.facts) {
    const plan = planFactWrites(args.existingFacts, update.facts);
    if (isEmptyPlan(plan)) {
      result.facts = plan;
    } else if (
      await applyFactPlan(db, { userId: args.userId, conversationId: args.conversationId, plan, source: args.source })
    ) {
      result.facts = plan;
    }
  }

  if (available.memories && update.summary) {
    result.summary = await saveMemory(db, {
      userId: args.userId,
      conversationId: args.conversationId,
      summary: update.summary,
      topics: update.topics,
    });
  }

  if (available.predictions) {
    const toWrite = planPredictionWrites(args.existingPredictions, update.predictions);
    if (
      toWrite.length > 0 &&
      (await insertPredictions(db, { userId: args.userId, conversationId: args.conversationId, predictions: toWrite }))
    ) {
      result.predictions = toWrite;
    }
  }

  return result;
}

/** A turn's memory is a few hundred bytes; anything near this is not one. */
export const MAX_INGEST_BYTES = 16_000;
/** Per-list ceilings for an ingest. Past these the whole request is refused, not trimmed. */
export const MAX_INGEST_ITEMS = 10;

/** Null when the body has the right shape and sizes; otherwise what is wrong with it. */
export function checkIngestShape(body: Record<string, unknown>): string | null {
  const list = (value: unknown, name: string) => {
    if (value === undefined) return null;
    if (!Array.isArray(value)) return `${name} must be a list`;
    if (value.length > MAX_INGEST_ITEMS) return `Too many ${name}`;
    return null;
  };
  if (body.facts !== undefined) {
    if (!body.facts || typeof body.facts !== "object" || Array.isArray(body.facts)) return "facts must be an object";
    const f = body.facts as Record<string, unknown>;
    for (const key of ["add", "update", "remove"]) {
      const err = list(f[key], `facts.${key}`);
      if (err) return err;
    }
  }
  if (body.summary !== undefined && body.summary !== null && typeof body.summary !== "string") return "summary must be text";
  return list(body.topics, "topics") ?? list(body.predictions, "predictions");
}
