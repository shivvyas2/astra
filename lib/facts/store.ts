import type { Db } from "@/lib/supabase/route";
import {
  MAX_FACTS,
  isFactCategory,
  type FactCategory,
  type FactConfidence,
  type FactSource,
  type UserFact,
} from "./types";

/**
 * Reads and writes of `user_facts`, always through the caller's own Supabase
 * client so Row Level Security decides what is visible.
 *
 * Production can lag the repo by a migration or two (0006 and 0007 were
 * missing for weeks), and main deploys on every push. So nothing here throws:
 * a missing table or a failed query reads as "no facts", which is exactly how
 * every reading behaved before this feature existed.
 */

type PgError = { code?: string; message?: string } | null | undefined;

/**
 * True when the table has not been created yet: Postgres's undefined_table
 * (42P01), or PostgREST's "not in the schema cache" (PGRST205, and PGRST204
 * for a missing column) — which is what supabase-js actually returns.
 */
export function isMissingTable(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("user_facts") && (message.includes("does not exist") || message.includes("schema cache"));
}

let missingLogged = false;

/**
 * Logs a facts failure. A missing table is logged once per server instance —
 * until 0008 is applied it would otherwise fire on every reading.
 */
export function logFactsError(where: string, error: unknown): void {
  if (isMissingTable(error as PgError)) {
    if (missingLogged) return;
    missingLogged = true;
    console.warn(`user_facts table missing (${where}); facts are off until migration 0008 is applied`);
    return;
  }
  console.error(`user facts ${where} error`, error);
}

/**
 * True when a column the query names does not exist yet — 0008 applied but
 * not 0009. Postgres's undefined_column (42703) on a read, PostgREST's
 * PGRST204 on a write.
 */
export function isMissingColumn(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("column") && (message.includes("does not exist") || message.includes("schema cache"));
}

/**
 * Set once this server instance has seen user_facts without the 0009
 * columns, so later reads and writes go straight to the 0008 shape instead
 * of failing first every time.
 */
let legacyColumns = false;

/** For tests: forget that the missing-table warning was printed, and what the columns looked like. */
export function resetFactsLogForTests(): void {
  missingLogged = false;
  legacyColumns = false;
}

const BASE_COLUMNS = "id, fact, category, created_at, updated_at";
const MEMORY_COLUMNS = `${BASE_COLUMNS}, confidence, last_confirmed_at, source`;

export type FactsResult = {
  facts: UserFact[];
  /** False when the table does not exist yet, so a client can say so. */
  available: boolean;
};

/** The caller's facts, newest first. Never throws. */
export async function loadFacts(db: Db, limit = MAX_FACTS): Promise<FactsResult> {
  try {
    const read = (columns: string) =>
      db.from("user_facts").select(columns).order("updated_at", { ascending: false }).limit(limit);
    let { data, error } = await read(legacyColumns ? BASE_COLUMNS : MEMORY_COLUMNS);
    if (error && !legacyColumns && isMissingColumn(error)) {
      legacyColumns = true;
      ({ data, error } = await read(BASE_COLUMNS));
    }
    if (error) {
      logFactsError("read", error);
      return { facts: [], available: !isMissingTable(error) };
    }
    const facts = ((data ?? []) as unknown as Record<string, unknown>[]).filter(
      (row): row is UserFact =>
        typeof row?.id === "string" && typeof row?.fact === "string" && isFactCategory(row?.category),
    );
    return { facts, available: true };
  } catch (err) {
    logFactsError("read", err);
    return { facts: [], available: true };
  }
}

/** What one extraction pass decided to change, already validated and deduped. */
export type FactPlan = {
  inserts: { fact: string; category: FactCategory; confidence?: FactConfidence }[];
  updates: { id: string; fact: string }[];
  deletes: string[];
  /** Existing facts the user said again: only their last_confirmed_at moves. */
  confirms?: string[];
};

export function isEmptyPlan(plan: FactPlan): boolean {
  return (
    plan.inserts.length === 0 &&
    plan.updates.length === 0 &&
    plan.deletes.length === 0 &&
    (plan.confirms ?? []).length === 0
  );
}

/**
 * Writes a plan as the user. Each statement is filtered on user_id as well as
 * RLS, the same belt-and-braces the life-events route uses. Returns false on
 * any failure, after logging it; the caller has nothing to roll back because
 * a half-applied plan is still a set of true statements the user made.
 */
export async function applyFactPlan(
  db: Db,
  args: { userId: string; conversationId?: string | null; plan: FactPlan; now?: string; source?: FactSource },
): Promise<boolean> {
  const { userId, plan } = args;
  const now = args.now ?? new Date().toISOString();
  // The 0009 columns, written only while they are known to exist. A write
  // that finds them missing is retried once in the 0008 shape.
  const withColumns = async (
    full: () => PromiseLike<{ error: PgError }>,
    legacy: () => PromiseLike<{ error: PgError }>,
  ): Promise<{ error: PgError }> => {
    if (legacyColumns) return legacy();
    const first = await full();
    if (first.error && isMissingColumn(first.error)) {
      legacyColumns = true;
      return legacy();
    }
    return first;
  };
  try {
    if (plan.deletes.length > 0) {
      const { error } = await db.from("user_facts").delete().in("id", plan.deletes).eq("user_id", userId);
      if (error) {
        logFactsError("delete", error);
        return false;
      }
    }
    for (const u of plan.updates) {
      const update = (extra: Record<string, unknown>) =>
        db
          .from("user_facts")
          .update({ fact: u.fact, updated_at: now, ...extra })
          .eq("id", u.id)
          .eq("user_id", userId);
      const { error } = await withColumns(
        () => update({ last_confirmed_at: now }),
        () => update({}),
      );
      if (error) {
        logFactsError("update", error);
        return false;
      }
    }
    // Confirming is the only write that needs 0009; without it there is
    // nothing to record, so it is skipped rather than retried.
    const confirms = plan.confirms ?? [];
    if (confirms.length > 0 && !legacyColumns) {
      const { error } = await db
        .from("user_facts")
        .update({ last_confirmed_at: now })
        .in("id", confirms)
        .eq("user_id", userId);
      if (error && isMissingColumn(error)) legacyColumns = true;
      else if (error) logFactsError("confirm", error);
    }
    if (plan.inserts.length > 0) {
      const rows = (extra: (f: FactPlan["inserts"][number]) => Record<string, unknown>) =>
        plan.inserts.map((f) => ({
          user_id: userId,
          fact: f.fact,
          category: f.category,
          source_conversation_id: args.conversationId ?? null,
          ...extra(f),
        }));
      const { error } = await withColumns(
        () =>
          db.from("user_facts").insert(
            rows((f) => ({ confidence: f.confidence ?? "stated", source: args.source ?? "chat", last_confirmed_at: now })),
          ),
        () => db.from("user_facts").insert(rows(() => ({}))),
      );
      if (error) {
        logFactsError("insert", error);
        return false;
      }
    }
    return true;
  } catch (err) {
    logFactsError("write", err);
    return false;
  }
}
