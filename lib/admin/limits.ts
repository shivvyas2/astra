import "server-only";
import { DateTime } from "luxon";
import { costSinceAll, loadLimits, loadUserLimits, NO_LIMITS, type Limits, type UserLimits } from "@/lib/usage/limits";

/**
 * Reading and changing the daily limits (migration 0018) from the admin, web
 * and iOS alike. See lib/usage/limits.ts for how they are enforced.
 */

type AnyDb = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type LimitsState = {
  /** False before migration 0018: nothing is limited and nothing can be saved. */
  available: boolean;
  limits: Limits;
  /** Everyone's model spend since midnight UTC, against usdAllUsersDay. */
  costTodayUsd: number;
};

export type UserLimitsState = { available: boolean; defaults: Limits; overrides: UserLimits | null };

const MAX_READINGS = 10_000;
const MAX_USD = 10_000;

/**
 * One limit from a form field or JSON value: blank or null is "no limit",
 * anything else a whole number of readings or dollars to the cent, 0 or more.
 * Undefined when the value is not a valid limit.
 */
export function parseLimit(raw: unknown, kind: "readings" | "usd"): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/^\$/, "");
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (kind === "readings") return Number.isInteger(n) && n <= MAX_READINGS ? n : undefined;
  return n <= MAX_USD ? Math.round(n * 100) / 100 : undefined;
}

export async function limitsState(db: AnyDb): Promise<LimitsState> {
  const limits = await loadLimits(db);
  if (!limits) return { available: false, limits: { ...NO_LIMITS }, costTodayUsd: 0 };
  let costTodayUsd = 0;
  try {
    costTodayUsd = await costSinceAll(db, DateTime.utc().startOf("day").toISO()!, null);
  } catch (err) {
    console.error("admin limits: cost today unavailable", err);
  }
  return { available: true, limits, costTodayUsd };
}

export async function userLimitsState(db: AnyDb, userId: string): Promise<UserLimitsState> {
  const defaults = await loadLimits(db);
  if (!defaults) return { available: false, defaults: { ...NO_LIMITS }, overrides: null };
  return { available: true, defaults, overrides: await loadUserLimits(db, userId) };
}

export async function saveLimits(db: AnyDb, limits: Limits, by: string): Promise<void> {
  const { error } = await db.from("usage_limits").upsert({
    id: true,
    readings_per_day: limits.readingsPerDay,
    usd_per_user_day: limits.usdPerUserDay,
    usd_all_users_day: limits.usdAllUsersDay,
    updated_at: new Date().toISOString(),
    updated_by: by,
  });
  if (error) throw error;
}

/** Sets one user's overrides; both null removes them, so the defaults apply. */
export async function saveUserLimits(db: AnyDb, userId: string, limits: UserLimits, by: string): Promise<void> {
  if (limits.readingsPerDay === null && limits.usdPerUserDay === null) {
    const { error } = await db.from("user_usage_limits").delete().eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await db.from("user_usage_limits").upsert({
    user_id: userId,
    readings_per_day: limits.readingsPerDay,
    usd_per_user_day: limits.usdPerUserDay,
    updated_at: new Date().toISOString(),
    updated_by: by,
  });
  if (error) throw error;
}
