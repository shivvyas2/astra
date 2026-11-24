"use server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupportedE164, toE164, type PhoneCountry } from "@/lib/auth/phone";
import {
  codeDigits,
  decodePendingEmail,
  emailCodeError,
  encodePendingEmail,
  isExistingAccount,
  looksLikeEmail,
  PENDING_EMAIL,
  PENDING_EMAIL_MAX_AGE,
  type PendingEmail,
} from "@/lib/auth/pendingEmail";

async function awaitEmailCode(pending: PendingEmail): Promise<void> {
  (await cookies()).set(PENDING_EMAIL, encodePendingEmail(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_EMAIL_MAX_AGE,
  });
}

// Smart auth: one form for both. Existing account with the right password logs
// in; a new email creates an account (then the code screen); an existing
// email with a wrong password shows an incorrect-password error.
export async function authenticate(formData: FormData) {
  const supabase = await createServerSupabase();
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const origin = (await headers()).get("origin") ?? "";
  // A code the login page turns into a sentence in the reader's language
  // (lib/i18n/errors.ts); Supabase's own messages pass through as they are.
  const back = (msg: string) => redirect(`/login?error=${encodeURIComponent(msg)}`);

  if (!email || !password) return back("missing");

  // 1) Try logging in first (the common case for returning users).
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data.session) redirect("/app");

  const signInMsg = (signIn.error?.message ?? "").toLowerCase();
  if (signInMsg.includes("not confirmed")) {
    // Signed up before and never confirmed: their old code is long gone.
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${origin}/auth/callback` } });
    await awaitEmailCode({ email, purpose: "signUp" });
    redirect(error ? `/verify-email?error=${emailCodeError(error.message)}` : "/verify-email");
  }

  // 2) Sign-in failed. Try to create the account.
  const signUp = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (signUp.error) {
    const m = signUp.error.message.toLowerCase();
    if (m.includes("already registered") || m.includes("already exists") || m.includes("already been registered")) {
      return back("password");
    }
    return back(signUp.error.message);
  }

  // New account created.
  if (signUp.data.session) redirect("/app"); // confirmation disabled
  // An account is already there, so this was a wrong password and no email is coming.
  if (isExistingAccount(signUp.data.user)) return back("password");
  await awaitEmailCode({ email, purpose: "signUp" });
  redirect("/verify-email");
}

// Email codes: the same shape as the texted ones below. `emailRedirectTo` is
// kept so a link in an older email template still lands somewhere sensible.
export async function sendEmailCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const from = String(formData.get("from")) === "signup" ? "/signup" : "/login";
  if (!looksLikeEmail(email)) redirect(`${from}?error=emailInvalid`);
  const supabase = await createServerSupabase();
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) redirect(`${from}?error=${emailCodeError(error.message)}`);
  await awaitEmailCode({ email, purpose: "signIn" });
  redirect("/verify-email");
}

export async function verifyEmailCode(formData: FormData) {
  const jar = await cookies();
  const pending = decodePendingEmail(jar.get(PENDING_EMAIL)?.value);
  if (!pending) redirect("/login?error=emailExpired");
  const token = codeDigits(formData.get("code"));
  if (token.length !== 6) redirect("/verify-email?error=emailCodeLength");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({
    email: pending.email,
    token,
    type: pending.purpose === "signUp" ? "signup" : "email",
  });
  if (error) redirect(`/verify-email?error=${emailCodeError(error.message, "codeInvalid")}`);
  jar.delete(PENDING_EMAIL);
  redirect("/app");
}

export async function resendEmailCode() {
  const pending = decodePendingEmail((await cookies()).get(PENDING_EMAIL)?.value);
  if (!pending) redirect("/login?error=emailExpired");
  const supabase = await createServerSupabase();
  const options = { emailRedirectTo: `${(await headers()).get("origin") ?? ""}/auth/callback` };
  const { error } =
    pending.purpose === "signUp"
      ? await supabase.auth.resend({ type: "signup", email: pending.email, options })
      : await supabase.auth.signInWithOtp({ email: pending.email, options });
  redirect(error ? `/verify-email?error=${emailCodeError(error.message)}` : "/verify-email?resent=1");
}

// Phone: one path for sign-in and sign-up. Supabase texts a six-digit code
// through Twilio Verify and creates the account on the first one. The number
// waiting for its code rides in a short-lived httpOnly cookie rather than the
// URL, so it stays out of history and logs.
const PENDING_PHONE = "astrya_pending_phone";

export async function sendPhoneCode(formData: FormData) {
  const country = (String(formData.get("country")) === "US" ? "US" : "IN") as PhoneCountry;
  const raw = String(formData.get("phone") ?? "").trim();
  const from = String(formData.get("from")) === "signup" ? "/signup" : "/login";
  const back = (code: string) => redirect(`${from}?method=phone&error=${encodeURIComponent(code)}`);
  if (!raw) return back("phoneMissing");
  const phone = toE164(country, raw);
  if (!phone) return back("phoneInvalid");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) return back(phoneErrorCode(error.message));

  (await cookies()).set(PENDING_PHONE, phone, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  redirect("/verify-phone");
}

export async function verifyPhoneCode(formData: FormData) {
  const jar = await cookies();
  const phone = jar.get(PENDING_PHONE)?.value;
  if (!isSupportedE164(phone)) redirect("/login?method=phone&error=phoneExpired");
  const token = String(formData.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
  if (token.length !== 6) redirect("/verify-phone?error=codeLength");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) redirect(`/verify-phone?error=${encodeURIComponent(phoneErrorCode(error.message, "codeInvalid"))}`);
  jar.delete(PENDING_PHONE);
  redirect("/app");
}

export async function resendPhoneCode() {
  const phone = (await cookies()).get(PENDING_PHONE)?.value;
  if (!isSupportedE164(phone)) redirect("/login?method=phone&error=phoneExpired");
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  redirect(error ? `/verify-phone?error=${encodeURIComponent(phoneErrorCode(error.message))}` : "/verify-phone?resent=1");
}

/** Supabase's wording, reduced to the codes lib/i18n/errors.ts knows. */
function phoneErrorCode(message: string, fallback = "other"): string {
  const m = message.toLowerCase();
  if (m.includes("provider") || m.includes("unsupported") || m.includes("disabled")) return "phoneUnavailable";
  if (m.includes("rate") || m.includes("too many")) return "rateLimit";
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) return "codeInvalid";
  return fallback;
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
