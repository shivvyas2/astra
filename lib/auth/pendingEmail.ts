/**
 * The email waiting for its six-digit code, kept in a short-lived httpOnly
 * cookie rather than the URL, so it stays out of history and logs.
 *
 * `signIn` is a code asked for in place of a password; `signUp` confirms the
 * address of a new account.
 */
export type PendingEmail = { email: string; purpose: "signIn" | "signUp" };

export const PENDING_EMAIL = "astrya_pending_email";

/** Codes last an hour (Supabase's default). */
export const PENDING_EMAIL_MAX_AGE = 60 * 60;

export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

export function encodePendingEmail(pending: PendingEmail): string {
  return `${pending.purpose}:${pending.email}`;
}

export function decodePendingEmail(raw: string | undefined): PendingEmail | null {
  const at = raw?.indexOf(":") ?? -1;
  if (!raw || at === -1) return null;
  const purpose = raw.slice(0, at), email = raw.slice(at + 1);
  if ((purpose !== "signIn" && purpose !== "signUp") || !looksLikeEmail(email)) return null;
  return { email, purpose };
}

/** The digits of a typed or pasted code; mail clients wrap codes in punctuation. */
export function codeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

/**
 * Supabase answers a sign-up for an address that already has a confirmed
 * account with a made-up user and no error, and sends no email, so that
 * nobody can probe for accounts. The made-up user has no identities.
 */
export function isExistingAccount(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}

/** Supabase's wording for an email code, reduced to codes lib/i18n/errors.ts knows. */
export function emailCodeError(message: string, fallback = "other"): string {
  const m = message.toLowerCase();
  if (m.includes("rate") || m.includes("too many") || m.includes("security purposes") || m.includes("seconds")) return "rateLimit";
  if (m.includes("expired") || m.includes("token")) return "codeInvalid";
  if (m.includes("email") && m.includes("invalid")) return "emailInvalid";
  if (m.includes("invalid")) return "codeInvalid";
  return fallback;
}
