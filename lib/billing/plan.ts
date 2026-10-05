import "server-only";
import type { Db } from "@/lib/supabase/route";
import { isMissingTable } from "./consent";

/**
 * Which plan a user is on: "plus" while an App Store subscription verified by
 * the server (POST /api/billing/apple, or a server notification) is active or
 * in its billing grace period and has not expired; "free" otherwise.
 *
 * Plus gates nothing today — every reading, Deep readings included, is open
 * to everyone. This answers the question for display ("Plus member") and for
 * whatever the owner decides Plus should include later.
 *
 * Never throws: a missing `subscriptions` table (migration 0011 not applied)
 * or a failed read is "free". `db` may be the caller's own client (RLS lets a
 * user read their own row) or the service-role client.
 */
export type Plan = "free" | "plus";

export async function getPlan(db: Db, userId: string): Promise<Plan> {
  try {
    const { data, error } = await db
      .from("subscriptions")
      .select("status, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (!isMissingTable(error, "subscriptions")) console.error("plan read error", error);
      return "free";
    }
    return planFromRow(data as { status?: string; expires_at?: string | null } | null);
  } catch (err) {
    console.error("plan read threw", err);
    return "free";
  }
}

/** Pure: the plan a `subscriptions` row grants at `now`. */
export function planFromRow(
  row: { status?: string; expires_at?: string | null } | null,
  now = new Date(),
): Plan {
  if (!row || (row.status !== "active" && row.status !== "grace")) return "free";
  if (!row.expires_at) return "free";
  const expires = new Date(row.expires_at).getTime();
  return Number.isFinite(expires) && expires > now.getTime() ? "plus" : "free";
}
