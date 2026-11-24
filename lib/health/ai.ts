/**
 * Whether the AI is answering, worked out from what is already stored: the
 * last successful model call (model_usage) and the questions nobody answered
 * since. Used by the scheduled job, whose failure is the alarm (GitHub emails
 * the owner), and by the admin dashboard's banner.
 */

// supabase-js clients (service role) and test fakes alike.
type HealthDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Questions without an answer, since the last success, that mean "down". One can be a dropped connection. */
export const UNANSWERED_IS_DOWN = 2;
const LOOKBACK_MS = 7 * 86_400_000;
/** Still being answered, not unanswered. */
const GRACE_MS = 3 * 60_000;

export type AiHealth = {
  down: boolean;
  /** The last model call that worked, or null when none is on record. */
  lastSuccessAt: string | null;
  /** Conversations whose newest question has had no answer since then. */
  unanswered: number;
};

type Row = { conversation_id: string; role: string; created_at: string };

const at = (iso: string) => Date.parse(iso);

export function healthFrom(messages: Row[], lastSuccessAt: string | null, now: Date): AiHealth {
  const newest = new Map<string, Row>();
  for (const m of messages) {
    const held = newest.get(m.conversation_id);
    if (!held || at(m.created_at) >= at(held.created_at)) newest.set(m.conversation_id, m);
  }
  const since = lastSuccessAt ? at(lastSuccessAt) : -Infinity;
  const waiting = [...newest.values()].filter(
    (m) => m.role === "user" && at(m.created_at) > since && now.getTime() - at(m.created_at) > GRACE_MS,
  );
  return { down: waiting.length >= UNANSWERED_IS_DOWN, lastSuccessAt, unanswered: waiting.length };
}

/** Null when it cannot be told (a failed read): not knowing is never an alarm. */
export async function loadAiHealth(db: HealthDb, now = new Date()): Promise<AiHealth | null> {
  try {
    const [usage, messages] = await Promise.all([
      db.from("model_usage").select("created_at").order("created_at", { ascending: false }).limit(1),
      db
        .from("messages")
        .select("conversation_id, role, created_at")
        .gte("created_at", new Date(now.getTime() - LOOKBACK_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (usage.error || messages.error) {
      console.error("ai health read failed", usage.error ?? messages.error);
      return null;
    }
    return healthFrom((messages.data ?? []) as Row[], (usage.data?.[0]?.created_at as string | undefined) ?? null, now);
  } catch (err) {
    console.error("ai health read failed", err);
    return null;
  }
}

/** Bad key, no credit, over a spend limit: one such refusal means every call will fail. */
export function isAccountProblem(reason: string | undefined): boolean {
  return /^(400|401|402|403)\b/.test(reason ?? "");
}

/**
 * Why a call failed, in words safe for a public log: an HTTP status and the
 * API's own error type, never its message or anything about a person.
 */
export function failureReason(err: unknown): string {
  const e = err as { status?: unknown; error?: { error?: { type?: unknown } }; name?: unknown } | null;
  const status = typeof e?.status === "number" ? String(e.status) : "";
  const type = e?.error?.error?.type;
  const safe = typeof type === "string" && /^[a-z_]{1,40}$/.test(type) ? type : "";
  return [status, safe].filter(Boolean).join(" ") || "unknown";
}
