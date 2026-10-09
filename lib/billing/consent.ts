import type { Db } from "@/lib/supabase/route";

/**
 * Consent to send personal data to a third-party AI (Anthropic).
 *
 * The notice the user agrees to is versioned. Bump CONSENT_VERSION whenever
 * what is sent, to whom, or what is kept changes materially: everyone is
 * asked again on their next visit. The iOS app carries the same string
 * (`ConsentPolicy.currentVersion`) and also reads it from GET /api/consent.
 *
 * Production can lag the repo by a migration, so nothing here throws and a
 * missing `ai_consents` table means "not enforced" (fail open): readings run
 * exactly as they did before consent existed, and clients fall back to the
 * consent they recorded locally.
 */
export const CONSENT_VERSION = "2026-10-05";

/** The web's local record of agreement, set by POST /api/consent only while the table is missing. */
export const CONSENT_COOKIE = "astrya_ai_consent";

export type ConsentPlatform = "ios" | "web";

export function isConsentPlatform(value: unknown): value is ConsentPlatform {
  return value === "ios" || value === "web";
}

type PgError = { code?: string; message?: string } | null | undefined;

/** Postgres undefined_table / PostgREST schema-cache misses for ai_consents (or subscriptions). */
export function isMissingTable(error: PgError, table = "ai_consents"): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes(table) && (message.includes("does not exist") || message.includes("schema cache"));
}

let missingLogged = false;
function logMissing(where: string) {
  if (missingLogged) return;
  missingLogged = true;
  console.warn(`ai_consents table missing (${where}); consent is recorded on devices only until migration 0011 is applied`);
}

/** For tests. */
export function resetConsentLogForTests(): void {
  missingLogged = false;
}

export type ConsentState = {
  /** True when the user has agreed to the current version. */
  accepted: boolean;
  /** The version they last agreed to, if any. */
  version: string | null;
  currentVersion: string;
  /**
   * False while the table does not exist (or the read failed): the server
   * cannot record or enforce consent, and clients rely on their local record.
   */
  stored: boolean;
};

export async function readConsent(db: Db, userId: string): Promise<ConsentState> {
  const base = { currentVersion: CONSENT_VERSION };
  try {
    const { data, error } = await db
      .from("ai_consents")
      .select("version, accepted_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) logMissing("read");
      else console.error("ai consent read error", error);
      return { ...base, accepted: false, version: null, stored: false };
    }
    const version = (data as { version?: string } | null)?.version ?? null;
    return { ...base, accepted: version === CONSENT_VERSION, version, stored: true };
  } catch (err) {
    console.error("ai consent read threw", err);
    return { ...base, accepted: false, version: null, stored: false };
  }
}

export type RecordResult = { ok: true; stored: boolean } | { ok: false };

/** Records agreement to `version` (upsert of the caller's own row, under RLS). */
export async function recordConsent(
  db: Db,
  userId: string,
  version: string,
  platform: ConsentPlatform,
): Promise<RecordResult> {
  try {
    const { error } = await db
      .from("ai_consents")
      .upsert(
        { user_id: userId, version, platform, accepted_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) {
      if (isMissingTable(error)) {
        logMissing("write");
        return { ok: true, stored: false };
      }
      console.error("ai consent write error", error);
      return { ok: false };
    }
    return { ok: true, stored: true };
  } catch (err) {
    console.error("ai consent write threw", err);
    return { ok: false };
  }
}

/** Withdraws consent: deletes the caller's row. A missing table means there was nothing to delete. */
export async function withdrawConsent(db: Db, userId: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await db.from("ai_consents").delete().eq("user_id", userId);
    if (error && !isMissingTable(error)) {
      console.error("ai consent delete error", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("ai consent delete threw", err);
    return { ok: false };
  }
}

/**
 * The chat route's gate. Returns a 403 `{ error: "consent_required" }`
 * response when the table exists and the user has not agreed to the current
 * version; null (carry on) otherwise — including when the table is missing
 * or the read fails, so a lagging database never blocks readings.
 */
export async function requireConsent(db: Db, userId: string): Promise<Response | null> {
  const state = await readConsent(db, userId);
  if (!state.stored || state.accepted) return null;
  return Response.json(
    {
      error: "consent_required",
      currentVersion: CONSENT_VERSION,
      message: "Readings need your OK to send your chart and question to Anthropic. Review it in the app to continue.",
    },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

/**
 * For the scheduled jobs, which run as the service role across every user:
 * the ids of people who have agreed to the current notice. `null` means the
 * table is missing or unreadable, and callers carry on for everyone (fail
 * open, as `requireConsent` does) rather than silently stopping every reading.
 */
export async function loadConsentedUserIds(db: Db): Promise<Set<string> | null> {
  try {
    const { data, error } = await db.from("ai_consents").select("user_id").eq("version", CONSENT_VERSION);
    if (error) {
      if (isMissingTable(error)) logMissing("cron");
      else console.error("ai consent list error", error);
      return null;
    }
    return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
  } catch (err) {
    console.error("ai consent list threw", err);
    return null;
  }
}

/** True when a scheduled job may send this user's data to the model. */
export function consentAllows(consented: Set<string> | null, userId: string): boolean {
  return consented === null || consented.has(userId);
}
