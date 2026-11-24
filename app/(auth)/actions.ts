"use server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupportedE164, toE164, type PhoneCountry } from "@/lib/auth/phone";
import {
  codeDigits,
  codeError,
  CODE_SECONDS,
  codeTimers,
  decodePending,
  encodePending,
  isDisposableEmail,
  isExistingAccount,
  looksLikeEmail,
  PENDING_EMAIL,
  PENDING_PHONE,
  type PendingCode,
} from "@/lib/auth/pendingCode";
import { throttle } from "@/lib/auth/throttle";

/** What the code screen shows after a try. `waitSeconds` starts its countdown. */
export type CodeState = { error?: string; notice?: "resent"; waitSeconds?: number; sentAt?: number; resends?: number; tries?: number };

const cookieFor = (p: Pick<PendingCode, "purpose">) => (p.purpose === "phone" ? PENDING_PHONE : PENDING_EMAIL);

async function remember(p: PendingCode): Promise<void> {
  (await cookies()).set(cookieFor(p), encodePending(p), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: p.purpose === "phone" ? CODE_SECONDS.phone : CODE_SECONDS.email,
  });
}

/** A field people never see. Whatever fills it in is told all went well and sent nothing. */
const isBot = (formData: FormData) => String(formData.get("website") ?? "") !== "";

const callbackUrl = async () => `${(await headers()).get("origin") ?? ""}/auth/callback`;

/** Sends (or sends again) whichever code `p` is. Null when it went. */
async function send(p: Pick<PendingCode, "to" | "purpose">): Promise<string | null> {
  try {
    const supabase = await createServerSupabase();
    const { error } =
      p.purpose === "phone"
        ? await supabase.auth.signInWithOtp({ phone: p.to })
        : p.purpose === "signUp"
          ? await supabase.auth.resend({ type: "signup", email: p.to, options: { emailRedirectTo: await callbackUrl() } })
          : await supabase.auth.signInWithOtp({ email: p.to, options: { emailRedirectTo: await callbackUrl() } });
    if (!error) return null;
    console.error("sign-in code not sent", p.purpose, error.code ?? error.name);
    return codeError(error.message, "sendFailed");
  } catch (err) {
    console.error("sign-in code not sent", p.purpose, (err as Error).name);
    return "sendFailed";
  }
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
  if (isBot(formData)) return back("password");
  if ((await throttle("password", email)) > 0) return back("rateLimit");

  // 1) Try logging in first (the common case for returning users).
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data.session) redirect("/app");

  const signInMsg = (signIn.error?.message ?? "").toLowerCase();
  if (signInMsg.includes("not confirmed")) {
    // Signed up before and never confirmed: their old code is long gone.
    const wait = await throttle("send", email);
    const error = wait > 0 ? "rateLimit" : await send({ to: email, purpose: "signUp" });
    await remember({ to: email, purpose: "signUp", sentAt: error ? 0 : Date.now(), resends: 0 });
    redirect(error ? `/verify-email?error=${error}` : "/verify-email");
  }

  // 2) Sign-in failed. Try to create the account.
  if (isDisposableEmail(email)) return back("emailDisposable");
  if ((await throttle("send", email)) > 0) return back("rateLimit");
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
    return back(codeError(signUp.error.message, signUp.error.message));
  }

  // New account created.
  if (signUp.data.session) redirect("/app"); // confirmation disabled
  // An account is already there, so this was a wrong password and no email is coming.
  if (isExistingAccount(signUp.data.user)) return back("password");
  await remember({ to: email, purpose: "signUp", sentAt: Date.now(), resends: 0 });
  redirect("/verify-email");
}

// Codes, emailed or texted. `emailRedirectTo` is kept so a link in an older
// email template still lands somewhere sensible.
export async function sendEmailCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const from = String(formData.get("from")) === "signup" ? "/signup" : "/login";
  if (!looksLikeEmail(email)) redirect(`${from}?error=emailInvalid`);
  const pending: PendingCode = { to: email, purpose: "signIn", sentAt: Date.now(), resends: 0 };
  if (!isBot(formData)) {
    if (isDisposableEmail(email)) redirect(`${from}?error=emailDisposable`);
    // Asked twice in a hurry: the first code is on its way, so wait for it there.
    const held = decodePending((await cookies()).get(PENDING_EMAIL)?.value);
    if (held?.to === email && held.purpose === "signIn" && codeTimers(held, Date.now()).resendIn > 0) redirect("/verify-email");
    if ((await throttle("send", email)) > 0) redirect(`${from}?error=rateLimit`);
    const error = await send(pending);
    if (error) redirect(`${from}?error=${error}`);
  }
  await remember(pending);
  redirect("/verify-email");
}

// Phone: one path for sign-in and sign-up. Supabase texts a six-digit code
// through Twilio Verify and creates the account on the first one.
export async function sendPhoneCode(formData: FormData) {
  const country = (String(formData.get("country")) === "US" ? "US" : "IN") as PhoneCountry;
  const raw = String(formData.get("phone") ?? "").trim();
  const from = String(formData.get("from")) === "signup" ? "/signup" : "/login";
  const back = (code: string) => redirect(`${from}?method=phone&error=${encodeURIComponent(code)}`);
  if (!raw) return back("phoneMissing");
  const phone = toE164(country, raw);
  if (!phone) return back("phoneInvalid");

  const pending: PendingCode = { to: phone, purpose: "phone", sentAt: Date.now(), resends: 0 };
  if (!isBot(formData)) {
    const held = decodePending((await cookies()).get(PENDING_PHONE)?.value);
    if (held?.to === phone && codeTimers(held, Date.now()).resendIn > 0) redirect("/verify-phone");
    if ((await throttle("send", phone)) > 0) return back("rateLimit");
    const error = await send(pending);
    if (error) return back(error);
  }
  await remember(pending);
  redirect("/verify-phone");
}

async function pendingFrom(formData: FormData): Promise<PendingCode | null> {
  const name = String(formData.get("channel")) === "phone" ? PENDING_PHONE : PENDING_EMAIL;
  const p = decodePending((await cookies()).get(name)?.value);
  return p && (p.purpose !== "phone" || isSupportedE164(p.to)) ? p : null;
}

/** Checks a code. Answers in place, so a wrong one never loses the screen. */
export async function verifyCode(prev: CodeState, formData: FormData): Promise<CodeState> {
  const pending = await pendingFrom(formData);
  if (!pending) return { error: "codeGone" };
  const token = codeDigits(formData.get("code"));
  const keep = { sentAt: prev.sentAt, resends: prev.resends, tries: prev.tries ?? 0 };
  if (token.length !== 6) return { ...keep, error: pending.purpose === "phone" ? "codeLength" : "emailCodeLength" };

  const wait = await throttle("verify", pending.to);
  if (wait > 0) return { ...keep, error: "codeLocked", waitSeconds: wait };

  try {
    const supabase = await createServerSupabase();
    const { error } =
      pending.purpose === "phone"
        ? await supabase.auth.verifyOtp({ phone: pending.to, token, type: "sms" })
        : await supabase.auth.verifyOtp({ email: pending.to, token, type: pending.purpose === "signUp" ? "signup" : "email" });
    if (error) {
      // A server having a bad moment is not a wrong code, and costs no try.
      if (!error.status || error.status >= 500) return { ...keep, error: "verifyFailed" };
      return { ...keep, error: codeError(error.message, "codeInvalid"), tries: keep.tries + 1 };
    }
  } catch {
    return { ...keep, error: "verifyFailed" };
  }
  (await cookies()).delete(cookieFor(pending));
  redirect("/app");
}

/** Sends another code, once the wait is over. */
export async function resendCode(prev: CodeState, formData: FormData): Promise<CodeState> {
  const pending = await pendingFrom(formData);
  if (!pending) return { error: "codeGone" };
  const { resendIn } = codeTimers(pending, Date.now());
  if (resendIn > 0) return { ...prev, notice: undefined, error: "resendWait", waitSeconds: resendIn };
  const wait = await throttle("send", pending.to);
  if (wait > 0) return { ...prev, notice: undefined, error: "rateLimit", waitSeconds: wait };
  const error = await send(pending);
  if (error) return { ...prev, notice: undefined, error };
  const next = { ...pending, sentAt: Date.now(), resends: pending.resends + 1 };
  await remember(next);
  return { notice: "resent", sentAt: next.sentAt, resends: next.resends, tries: 0 };
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
