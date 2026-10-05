import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "./consent";
import { statusOf, type SubscriptionStatus, type VerifiedTransaction } from "./apple";

/**
 * Writes to `subscriptions`. Always with the service-role client: the table
 * has no write policies, so only the server can change what plan a user is
 * on, and only after verifying Apple's signature.
 */

export type SubscriptionRow = {
  user_id: string;
  plan: "free" | "plus";
  status: SubscriptionStatus;
  product_id: string | null;
  original_transaction_id: string | null;
  expires_at: string | null;
  environment: "Sandbox" | "Production" | null;
  updated_at: string;
};

export function rowFor(
  userId: string,
  tx: VerifiedTransaction,
  now = new Date(),
  override?: { status: SubscriptionStatus; expiresAt?: Date | null },
): SubscriptionRow {
  const status = override?.status ?? statusOf(tx, now);
  const expires = override?.expiresAt !== undefined ? override.expiresAt : tx.expiresAt;
  return {
    user_id: userId,
    plan: status === "active" || status === "grace" ? "plus" : "free",
    status,
    product_id: tx.productId,
    original_transaction_id: tx.originalTransactionId,
    expires_at: expires ? expires.toISOString() : null,
    environment: tx.environment,
    updated_at: now.toISOString(),
  };
}

export type LinkResult =
  | { ok: true; row: SubscriptionRow; stored: boolean }
  | { ok: false; status: 403 | 409 | 500; error: string };

/**
 * Attaches a verified purchase to `userId`.
 *
 * - If the app set `appAccountToken` at purchase, it must be this user's id:
 *   one account cannot claim another's purchase by replaying its JWS.
 * - An Apple subscription already attached to a different account moves only
 *   when the token proves it belongs to this one; otherwise 409.
 */
export async function linkTransaction(
  admin: SupabaseClient,
  userId: string,
  tx: VerifiedTransaction,
  now = new Date(),
): Promise<LinkResult> {
  const uid = userId.toLowerCase();
  if (tx.appAccountToken && tx.appAccountToken !== uid) {
    return { ok: false, status: 403, error: "This purchase belongs to a different Astrya account." };
  }
  const row = rowFor(userId, tx, now);
  try {
    const { data: holder, error: readError } = await admin
      .from("subscriptions")
      .select("user_id, expires_at")
      .eq("original_transaction_id", tx.originalTransactionId)
      .maybeSingle();
    if (readError) {
      if (isMissingTable(readError, "subscriptions")) return { ok: true, row, stored: false };
      throw readError;
    }
    const holderId = (holder as { user_id?: string } | null)?.user_id;
    if (holderId && holderId !== userId) {
      if (tx.appAccountToken !== uid) {
        return { ok: false, status: 409, error: "This Apple subscription is already linked to another Astrya account." };
      }
      const { error: releaseError } = await admin.from("subscriptions").delete().eq("user_id", holderId);
      if (releaseError) throw releaseError;
    }
    // Never step backwards: an older transaction posted after a newer renewal
    // (two devices restoring at once) must not shorten the subscription.
    const { data: mine } = await admin
      .from("subscriptions")
      .select("expires_at, original_transaction_id, status")
      .eq("user_id", userId)
      .maybeSingle();
    const current = mine as { expires_at?: string | null; original_transaction_id?: string | null; status?: string } | null;
    if (
      current?.original_transaction_id === tx.originalTransactionId &&
      current.expires_at &&
      row.expires_at &&
      current.status !== "revoked" &&
      row.status !== "revoked" &&
      new Date(current.expires_at).getTime() > new Date(row.expires_at).getTime()
    ) {
      const kept = statusOf({ expiresAt: new Date(current.expires_at), revokedAt: null }, now);
      return {
        ok: true,
        row: { ...row, expires_at: current.expires_at, status: kept, plan: kept === "active" ? "plus" : "free" },
        stored: true,
      };
    }
    const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
    if (error) {
      if (isMissingTable(error, "subscriptions")) return { ok: true, row, stored: false };
      throw error;
    }
    return { ok: true, row, stored: true };
  } catch (err) {
    console.error("subscription link error", err);
    return { ok: false, status: 500, error: "Could not record the purchase. It is safe to try again." };
  }
}

/**
 * Applies a server notification to the row holding `originalTransactionId`,
 * or — for a first purchase the app has not posted yet — to the account
 * named by `appAccountToken`. Returns false when there is no one to apply it to.
 */
export async function applyNotification(
  admin: SupabaseClient,
  tx: VerifiedTransaction,
  override: { status: SubscriptionStatus; expiresAt?: Date | null } | undefined,
  now = new Date(),
): Promise<{ applied: boolean; stored: boolean }> {
  try {
    const { data: holder, error } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("original_transaction_id", tx.originalTransactionId)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error, "subscriptions")) return { applied: false, stored: false };
      throw error;
    }
    const userId = (holder as { user_id?: string } | null)?.user_id ?? tx.appAccountToken;
    if (!userId) return { applied: false, stored: true };
    const row = rowFor(userId, tx, now, override);
    const { error: writeError } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
    if (writeError) throw writeError;
    return { applied: true, stored: true };
  } catch (err) {
    console.error("subscription notification error", err);
    throw err;
  }
}
