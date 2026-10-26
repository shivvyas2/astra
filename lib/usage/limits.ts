import "server-only";
import { DateTime } from "luxon";
import { isMissingRelation } from "./record";
import { countReadingsSince, dayWindow } from "./today";
import { isAdminId } from "@/lib/admin/api";
import { isReadingLanguage, type ReadingLanguage } from "@/lib/astrology/language";
import { localeForLanguage } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/dictionaries";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * The daily limits on paid model calls (migration 0018), set from the admin.
 *
 * Readings are free, so these are what keep one account, or a script making
 * many, from spending the Anthropic balance. Each limit is null for "none".
 * Admins are never limited. Before 0018 is applied, or when a lookup fails,
 * nothing is limited: a database hiccup should not stop every reading.
 */

// The service-role client; typed loosely so tests can pass fakes.
type AnyDb = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Limits = {
  readingsPerDay: number | null;
  usdPerUserDay: number | null;
  usdAllUsersDay: number | null;
};

/** One user's overrides. A null field falls back to the default. */
export type UserLimits = { readingsPerDay: number | null; usdPerUserDay: number | null };

export const NO_LIMITS: Limits = { readingsPerDay: null, usdPerUserDay: null, usdAllUsersDay: null };

export type LimitBlock = {
  /** readings: this user's readings today; user_spend: this user's cost today; all_spend: everyone's cost today. */
  reason: "readings" | "user_spend" | "all_spend";
  /** When the window that tripped ends. */
  resetAt: string;
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** The defaults, or null before migration 0018. Throws on any other error. */
export async function loadLimits(db: AnyDb): Promise<Limits | null> {
  const { data, error } = await db
    .from("usage_limits")
    .select("readings_per_day, usd_per_user_day, usd_all_users_day")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  if (!data) return { ...NO_LIMITS };
  return {
    readingsPerDay: num(data.readings_per_day),
    usdPerUserDay: num(data.usd_per_user_day),
    usdAllUsersDay: num(data.usd_all_users_day),
  };
}

/** One user's overrides, or null when they have none (or before 0018). */
export async function loadUserLimits(db: AnyDb, userId: string): Promise<UserLimits | null> {
  const { data, error } = await db
    .from("user_usage_limits")
    .select("readings_per_day, usd_per_user_day")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  if (!data) return null;
  return { readingsPerDay: num(data.readings_per_day), usdPerUserDay: num(data.usd_per_user_day) };
}

/** The limits that apply to one user: their overrides over the defaults. */
export function effectiveLimits(defaults: Limits, user: UserLimits | null): Limits {
  return {
    readingsPerDay: user?.readingsPerDay ?? defaults.readingsPerDay,
    usdPerUserDay: user?.usdPerUserDay ?? defaults.usdPerUserDay,
    usdAllUsersDay: defaults.usdAllUsersDay,
  };
}

/** Model spend since `since`, for one user or (null) everyone. Summed in the database. */
export async function costSinceAll(db: AnyDb, since: string, userId: string | null): Promise<number> {
  const { data, error } = await db.rpc("model_cost_since", { since, uid: userId });
  if (error) throw error;
  return Number(data ?? 0);
}

type Profile = { timezone: string | null; language: string };

async function loadProfile(db: AnyDb, userId: string): Promise<Profile> {
  try {
    const { data, error } = await db
      .from("birth_profiles")
      .select("timezone, reading_language")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return { timezone: null, language: "english" };
    return { timezone: (data.timezone as string | null) ?? null, language: String(data.reading_language ?? "english") };
  } catch {
    return { timezone: null, language: "english" };
  }
}

export type LimitCheck = { block: LimitBlock | null; language: string };

/**
 * Whether this user may make another paid call now. `reading` also counts
 * their readings against readings_per_day; the timeline routes pass false
 * and are held by the spend limits alone.
 *
 * The user's limits run over their local day (their birth-profile timezone,
 * as GET /api/usage reports it); the all-users limit over the UTC day.
 */
export async function checkUsageLimits(
  db: AnyDb,
  userId: string,
  opts: { reading: boolean; now?: Date },
): Promise<LimitCheck> {
  const now = opts.now ?? new Date();
  try {
    const [defaults, overrides, admin, profile] = await Promise.all([
      loadLimits(db),
      loadUserLimits(db, userId),
      isAdminId(db, userId),
      loadProfile(db, userId),
    ]);
    if (!defaults || admin) return { block: null, language: profile.language };
    const limits = effectiveLimits(defaults, overrides);
    const { start, resetAt } = dayWindow(profile.timezone, now);
    const utcStart = DateTime.fromJSDate(now).toUTC().startOf("day");

    const [allCost, readings, userCost] = await Promise.all([
      limits.usdAllUsersDay !== null ? costSinceAll(db, utcStart.toISO()!, null) : 0,
      opts.reading && limits.readingsPerDay !== null ? countReadingsSince(db, userId, start).then((c) => c.readings) : 0,
      limits.usdPerUserDay !== null ? costSinceAll(db, start, userId) : 0,
    ]);

    let block: LimitBlock | null = null;
    if (limits.usdAllUsersDay !== null && allCost >= limits.usdAllUsersDay) {
      block = { reason: "all_spend", resetAt: utcStart.plus({ days: 1 }).toISO()! };
    } else if (opts.reading && limits.readingsPerDay !== null && readings >= limits.readingsPerDay) {
      block = { reason: "readings", resetAt };
    } else if (limits.usdPerUserDay !== null && userCost >= limits.usdPerUserDay) {
      block = { reason: "user_spend", resetAt };
    }
    if (block) console.warn(`usage limit ${block.reason} for ${userId}`);
    return { block, language: profile.language };
  } catch (err) {
    console.error("usage limit check failed; allowing the call", err);
    return { block: null, language: "english" };
  }
}

/** checkUsageLimits with the service-role client; allows the call when that client is unavailable. */
export async function guardUsage(userId: string, opts: { reading: boolean }): Promise<LimitCheck> {
  let db: AnyDb;
  try {
    db = createAdminSupabase();
  } catch (err) {
    console.error("usage limit check: service client unavailable", err);
    return { block: null, language: "english" };
  }
  return checkUsageLimits(db, userId, opts);
}

/** What to tell the user, in their reading language. */
export function limitMessage(block: LimitBlock, language: string): string {
  const reading: ReadingLanguage = isReadingLanguage(language) ? language : "english";
  const chat = messagesFor(localeForLanguage(reading)).chat;
  return block.reason === "all_spend" ? chat.limitPaused : chat.limitReached;
}

/**
 * The 429 for a refused call. Plain text, because the iPhone app (every build
 * so far) and the web chat show a failed reading's body as its reply.
 */
export function limitResponse(block: LimitBlock, language: string): Response {
  return new Response(limitMessage(block, language), {
    status: 429,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-limit-reason": block.reason,
      "x-limit-reset": block.resetAt,
    },
  });
}
