import "server-only";
import { isMissingRelation } from "@/lib/usage/record";

/**
 * Who notifications go to: anyone who opened Astrya in the last seven days.
 * After a week without a visit nothing is written, sent or paid for; one
 * visit starts it all again.
 */
export const QUIET_AFTER_DAYS = 7;

// supabase-js (service role) or a test fake.
type AnyDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Last visit by user, as far as what is stored can say. Null when it cannot be told: then nobody is paused. */
export type Activity = Map<string, number> | null;

export function isListening(activity: Activity, userId: string, now = Date.now()): boolean {
  if (!activity) return true;
  return now - (activity.get(userId) ?? 0) < QUIET_AFTER_DAYS * 86_400_000;
}

export async function loadActivity(db: AnyDb, now = Date.now()): Promise<Activity> {
  const since = new Date(now - QUIET_AFTER_DAYS * 86_400_000).toISOString();
  const last: Map<string, number> = new Map();
  const put = (userId: unknown, at: unknown) => {
    const t = typeof at === "string" ? Date.parse(at) : NaN;
    if (typeof userId === "string" && t > (last.get(userId) ?? 0)) last.set(userId, t);
  };
  type Row = Record<string, unknown>;
  /** Everything a person does that only an open app can do. */
  const sources: [string, string, string, (r: Row) => unknown][] = [
    ["user_activity", "user_id, last_seen_at", "last_seen_at", (r) => r.user_id],
    ["device_tokens", "user_id, updated_at", "updated_at", (r) => r.user_id],
    ["birth_profiles", "user_id, updated_at", "updated_at", (r) => r.user_id],
    ["daily_readings", "user_id, read_at", "read_at", (r) => r.user_id],
    ["alerts", "user_id, read_at", "read_at", (r) => r.user_id],
    ["conversations", "user_id, created_at", "created_at", (r) => r.user_id],
    ["messages", "created_at, conversations!inner(user_id)", "created_at", (r) => (r.conversations as Row | null)?.user_id],
  ];
  try {
    const results = await Promise.all(
      sources.map(([table, columns, at]) => db.from(table).select(columns).gte(at, since).order(at, { ascending: false }).limit(1000)),
    );
    for (const [i, { data, error }] of results.entries()) {
      const [table, , at, who] = sources[i];
      if (error) {
        // A table a migration has not made yet is a missing signal, not a failure.
        if (isMissingRelation(error)) continue;
        console.error("activity read failed", table, error);
        return null;
      }
      for (const row of (data ?? []) as Row[]) put(who(row), row[at]);
    }
    return last;
  } catch (err) {
    console.error("activity read failed", err);
    return null;
  }
}
