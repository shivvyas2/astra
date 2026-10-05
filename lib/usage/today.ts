import "server-only";
import { DateTime } from "luxon";
import { isMissingRelation } from "./record";

/**
 * A user's own reading counts, for GET /api/usage. Informational only: there
 * is no quota, and nothing here ever blocks a request.
 *
 * Counted from model_usage (0010). Before 0010 is applied, readings fall back
 * to the assistant messages written in the window and Deep reads as 0; if
 * every query fails, zeros. Never throws.
 */

// Both clients are supabase-js clients; typed loosely so tests can pass fakes.
type AnyDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ReadingCounts = { readings: number; deep: number; source: "usage" | "messages" | "none" };

let missingLogged = false;
/** For tests. */
export function resetTodayLogForTests(): void {
  missingLogged = false;
}

/** The start of the user's current day and the next one, in their zone (UTC when unknown or invalid). */
export function dayWindow(timezone: string | null | undefined, now: Date = new Date()): { start: string; resetAt: string } {
  let local = DateTime.fromJSDate(now).setZone(timezone || "UTC");
  if (!local.isValid) local = DateTime.fromJSDate(now).setZone("UTC");
  const start = local.startOf("day");
  return { start: start.toUTC().toISO()!, resetAt: start.plus({ days: 1 }).toUTC().toISO()! };
}

export async function countReadingsSince(admin: AnyDb, userId: string, since: string): Promise<ReadingCounts> {
  try {
    const { data, error } = await admin
      .from("model_usage")
      .select("kind")
      .eq("user_id", userId)
      .in("kind", ["reading", "deep_reading"])
      .gte("created_at", since)
      .limit(5000);
    if (!error) {
      const rows = (data ?? []) as { kind: string }[];
      return { readings: rows.length, deep: rows.filter((r) => r.kind === "deep_reading").length, source: "usage" };
    }
    if (!isMissingRelation(error)) throw error;
    if (!missingLogged) {
      missingLogged = true;
      console.warn("model_usage table missing; counting readings from messages until migration 0010 is applied");
    }
  } catch (err) {
    console.error("usage count error", err);
  }

  try {
    const { data: convs, error: convError } = await admin.from("conversations").select("id").eq("user_id", userId);
    if (convError) throw convError;
    const ids = ((convs ?? []) as { id: string }[]).map((c) => c.id);
    if (ids.length === 0) return { readings: 0, deep: 0, source: "messages" };
    const { count, error } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", ids)
      .eq("role", "assistant")
      .gte("created_at", since);
    if (error) throw error;
    return { readings: count ?? 0, deep: 0, source: "messages" };
  } catch (err) {
    console.error("usage fallback count error", err);
    return { readings: 0, deep: 0, source: "none" };
  }
}

/** USD the user's calls have cost since `since`. 0 when model_usage is absent or unreadable. */
export async function costSince(admin: AnyDb, userId: string, since: string): Promise<number> {
  try {
    const { data, error } = await admin
      .from("model_usage")
      .select("cost_usd")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(50000);
    if (error) return 0;
    const total = ((data ?? []) as { cost_usd: number | string | null }[]).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
    return Math.round(total * 1e6) / 1e6;
  } catch {
    return 0;
  }
}
