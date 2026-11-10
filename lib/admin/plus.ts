import { planFromRow } from "@/lib/billing/plan";
import { isMissingTable } from "@/lib/billing/consent";

/**
 * Plus granted by hand from the admin, with no App Store purchase behind it.
 *
 * A grant is an ordinary `subscriptions` row (status "active", plan "plus")
 * marked by `product_id = ADMIN_GRANT_PRODUCT` and no Apple transaction id, so
 * `getPlan` and everything reading it treat the user as Plus until it expires.
 * Apple server notifications only touch rows holding an Apple transaction id,
 * so they never overwrite a grant; a later real purchase replaces it.
 */

type AnyDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const ADMIN_GRANT_PRODUCT = "admin_grant";

export const GRANT_DURATIONS = [
  { id: "1m", label: "1 month" },
  { id: "3m", label: "3 months" },
  { id: "1y", label: "1 year" },
  { id: "forever", label: "Forever" },
] as const;
export type GrantDuration = (typeof GRANT_DURATIONS)[number]["id"];

/** `planFromRow` needs an expiry, so "forever" is a date far enough away. */
const FOREVER = "2099-12-31T23:59:59.000Z";

export function isGrantDuration(v: unknown): v is GrantDuration {
  return GRANT_DURATIONS.some((d) => d.id === v);
}

/** When a grant made at `now` ends. Extends from the current expiry if later. */
export function grantExpiry(duration: GrantDuration, now = new Date(), currentExpiry?: string | null): string {
  if (duration === "forever") return FOREVER;
  const current = currentExpiry ? new Date(currentExpiry) : null;
  const from = current && Number.isFinite(current.getTime()) && current > now ? current : now;
  const d = new Date(from);
  if (duration === "1m") d.setUTCMonth(d.getUTCMonth() + 1);
  else if (duration === "3m") d.setUTCMonth(d.getUTCMonth() + 3);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

export type PlusState = {
  /** False before migration 0011: there is nowhere to record a grant. */
  available: boolean;
  plan: "free" | "plus";
  /** Where the current row came from, or "none" when there is no row. */
  source: "none" | "admin" | "apple";
  status: string | null;
  expiresAt: string | null;
  forever: boolean;
};

type Row = { status?: string; expires_at?: string | null; product_id?: string | null; original_transaction_id?: string | null };

async function readRow(db: AnyDb, userId: string): Promise<{ row: Row | null; available: boolean }> {
  const { data, error } = await db
    .from("subscriptions")
    .select("status, expires_at, product_id, original_transaction_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error, "subscriptions")) return { row: null, available: false };
    throw error;
  }
  return { row: (data as Row | null) ?? null, available: true };
}

function sourceOf(row: Row | null): PlusState["source"] {
  if (!row) return "none";
  return row.original_transaction_id ? "apple" : "admin";
}

export async function plusState(db: AnyDb, userId: string, now = new Date()): Promise<PlusState> {
  try {
    const { row, available } = await readRow(db, userId);
    return {
      available,
      plan: planFromRow(row, now),
      source: sourceOf(row),
      status: row?.status ?? null,
      expiresAt: row?.expires_at ?? null,
      forever: row?.expires_at === FOREVER,
    };
  } catch (err) {
    console.error("admin plus state error", err);
    return { available: false, plan: "free", source: "none", status: null, expiresAt: null, forever: false };
  }
}

export type GrantResult = "granted" | "apple" | "unavailable";

/**
 * Grants or extends Plus. Refuses ("apple") while the user has a live App
 * Store subscription: overwriting it would drop the Apple transaction id and
 * cut the row off from Apple's renewal notifications.
 */
export async function grantPlus(db: AnyDb, userId: string, duration: GrantDuration, now = new Date()): Promise<GrantResult> {
  const { row, available } = await readRow(db, userId);
  if (!available) return "unavailable";
  const source = sourceOf(row);
  if (source === "apple" && planFromRow(row, now) === "plus") return "apple";
  const currentExpiry = source === "admin" && planFromRow(row, now) === "plus" ? row?.expires_at : null;
  const { error } = await db.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: "plus",
      status: "active",
      product_id: ADMIN_GRANT_PRODUCT,
      original_transaction_id: null,
      expires_at: grantExpiry(duration, now, currentExpiry),
      environment: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  return "granted";
}

export type RevokeResult = "revoked" | "apple" | "none";

/** Removes an admin grant. An App Store subscription is the user's to cancel. */
export async function revokePlus(db: AnyDb, userId: string): Promise<RevokeResult> {
  const { row, available } = await readRow(db, userId);
  if (!available || !row) return "none";
  if (sourceOf(row) === "apple") return "apple";
  const { error } = await db.from("subscriptions").delete().eq("user_id", userId);
  if (error) throw error;
  return "revoked";
}
