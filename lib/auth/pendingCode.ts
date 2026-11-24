/**
 * A sign-in code that has been sent and is waiting to be entered: to whom,
 * when, and how many times. Kept in a short-lived httpOnly cookie rather than
 * the URL, so it stays out of history and logs.
 *
 * It drives the screen's timers only. The limits that matter are counted on
 * the server (lib/auth/throttle.ts), where a cleared cookie changes nothing.
 */
export type PendingCode = {
  /** The email address, or the number in E.164. */
  to: string;
  /** signIn: in place of a password. signUp: confirms a new account's email. phone: texted. */
  purpose: "signIn" | "signUp" | "phone";
  /** Milliseconds since 1970; 0 when not known. */
  sentAt: number;
  /** Sent again this many times. */
  resends: number;
};

export const PENDING_EMAIL = "astrya_pending_email";
export const PENDING_PHONE = "astrya_pending_phone";

/** How long a code lasts: Supabase's email setting, and Twilio Verify's ten minutes. */
export const CODE_SECONDS = { email: 60 * 60, phone: 60 * 10 } as const;

/** How long to wait before another: longer each time. */
export const RESEND_WAITS = [60, 60, 120, 300] as const;

export function resendWait(resends: number): number {
  return RESEND_WAITS[Math.min(Math.max(0, resends), RESEND_WAITS.length - 1)];
}

/** Seconds until another code may be asked for, and until this one runs out. */
export function codeTimers(p: Pick<PendingCode, "sentAt" | "resends" | "purpose">, now: number): { resendIn: number; expiresIn: number } {
  if (!p.sentAt) return { resendIn: 0, expiresIn: 0 };
  const passed = Math.max(0, (now - p.sentAt) / 1000);
  const life = p.purpose === "phone" ? CODE_SECONDS.phone : CODE_SECONDS.email;
  return { resendIn: Math.max(0, Math.ceil(resendWait(p.resends) - passed)), expiresIn: Math.max(0, Math.ceil(life - passed)) };
}

/** "0:42", "12:05". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

export function encodePending(p: PendingCode): string {
  return [p.purpose, p.sentAt, p.resends, p.to].join(":");
}

export function decodePending(raw: string | undefined): PendingCode | null {
  const m = raw?.match(/^(signIn|signUp|phone):(\d{1,15}):(\d{1,3}):(.+)$/);
  if (!m) return null;
  const [, purpose, sentAt, resends, to] = m;
  if (purpose === "phone" ? !/^\+\d{8,15}$/.test(to) : !looksLikeEmail(to)) return null;
  return { purpose: purpose as PendingCode["purpose"], sentAt: Number(sentAt), resends: Number(resends), to };
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

/**
 * Inboxes made to be thrown away. A short list of the well-known ones, for new
 * codes only: it stops the lazy kind of spam without turning real people away.
 */
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "sharklasers.com", "10minutemail.com", "10minutemail.net",
  "temp-mail.org", "tempmail.com", "tempmail.dev", "tempmailo.com", "throwawaymail.com", "yopmail.com", "yopmail.fr",
  "getnada.com", "trashmail.com", "maildrop.cc", "dispostable.com", "fakeinbox.com", "mintemail.com", "moakt.com",
  "emailondeck.com", "mohmal.com", "mytemp.email", "spamgourmet.com", "discard.email",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return [...DISPOSABLE].some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Supabase's wording for a code, reduced to codes lib/i18n/errors.ts knows. */
export function codeError(message: string, fallback = "other"): string {
  const m = message.toLowerCase();
  if (m.includes("email rate limit") || m.includes("sms rate limit") || m.includes("over_email_send")) return "sendBusy";
  if (m.includes("rate") || m.includes("too many") || m.includes("security purposes") || m.includes("seconds")) return "rateLimit";
  if (m.includes("provider") || m.includes("unsupported") || m.includes("disabled")) return "phoneUnavailable";
  if (m.includes("expired") || m.includes("token")) return "codeInvalid";
  if (m.includes("email") && m.includes("invalid")) return "emailInvalid";
  if (m.includes("invalid")) return "codeInvalid";
  if (m.includes("fetch") || m.includes("network") || m.includes("timeout") || m.includes("error sending")) return "sendFailed";
  return fallback;
}
