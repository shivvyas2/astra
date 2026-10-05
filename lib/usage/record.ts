import "server-only";
import { after } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { costUsd, priceFor, type TokenCounts } from "./prices";

/**
 * Writes one `model_usage` row per paid model call (migration 0010).
 *
 * Tracking must never cost a reading anything: recordUsage never throws, a
 * missing table is logged once per server instance and then skipped, and
 * trackUsage schedules the write with `after()` so a request never waits on it.
 */

export type UsageKind = "reading" | "deep_reading" | "memory" | "daily" | "alert" | "extraction" | "other";

/** The fields of an Anthropic `usage` object that are billed. Every one optional, as older SDKs omit some. */
export type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
};

export type UsageRecord = {
  userId?: string | null;
  kind: UsageKind;
  model: string;
  usage?: UsageLike | null;
  conversationId?: string | null;
};

type PgError = { code?: string; message?: string } | null | undefined;

/** True when a table or column does not exist yet (Postgres or PostgREST codes). */
export function isMissingRelation(error: unknown): boolean {
  const e = error as PgError;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204" || e.code === "42703") return true;
  const message = (e.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** Splits a usage object into billed buckets. Writes without a TTL breakdown are billed at the 5-minute rate. */
export function tokenCounts(usage: UsageLike | null | undefined): TokenCounts {
  const u = usage ?? {};
  const w1h = n(u.cache_creation?.ephemeral_1h_input_tokens);
  const w5mBreakdown = n(u.cache_creation?.ephemeral_5m_input_tokens);
  const writes = n(u.cache_creation_input_tokens);
  const w5m = u.cache_creation ? w5mBreakdown : writes;
  return {
    input: n(u.input_tokens),
    output: n(u.output_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    cacheWrite5m: w5m,
    cacheWrite1h: w1h,
  };
}

/** The row recordUsage inserts. Exported for tests. */
export function usageRow(record: UsageRecord) {
  const t = tokenCounts(record.usage);
  return {
    user_id: record.userId ?? null,
    kind: record.kind,
    model: record.model,
    input_tokens: t.input,
    output_tokens: t.output,
    cache_read_tokens: t.cacheRead,
    cache_write_tokens: t.cacheWrite5m + t.cacheWrite1h,
    cost_usd: costUsd(record.model, t),
    conversation_id: record.conversationId ?? null,
  };
}

const logged = new Set<string>();
function logOnce(key: string, message: string, detail?: unknown) {
  if (logged.has(key)) return;
  logged.add(key);
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}

/** For tests: forget which warnings were printed. */
export function resetUsageLogForTests(): void {
  logged.clear();
}

type Inserter = { from(table: string): { insert(row: unknown): PromiseLike<{ error: unknown }> } };

/** Inserts one usage row with the service-role client. Never throws. */
export async function recordUsage(record: UsageRecord, db?: Inserter): Promise<void> {
  try {
    if (!priceFor(record.model)) {
      logOnce(`price:${record.model}`, `model_usage: no price for ${record.model}; recorded at $0`);
    }
    const client = db ?? (createAdminSupabase() as unknown as Inserter);
    const { error } = await client.from("model_usage").insert(usageRow(record));
    if (error) {
      if (isMissingRelation(error)) {
        logOnce("missing", "model_usage table missing; usage tracking is off until migration 0010 is applied");
      } else {
        logOnce(`error:${(error as PgError)?.code ?? "?"}`, "model_usage insert error", error);
      }
    }
  } catch (err) {
    logOnce("throw", "model_usage record skipped", err);
  }
}

/**
 * Records usage without making anyone wait: inside a request it runs after the
 * response is sent; outside one (a script, a test) it runs in the background.
 */
export function trackUsage(record: UsageRecord): void {
  const task = () => recordUsage(record);
  try {
    after(task);
  } catch {
    void task();
  }
}
