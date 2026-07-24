"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

// Smart auth: one form for both. Existing account with the right password logs
// in; a new email creates an account (then confirm-email screen); an existing
// email with a wrong password shows an incorrect-password error.
export async function authenticate(formData: FormData) {
  const supabase = await createServerSupabase();
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const origin = (await headers()).get("origin") ?? "";
  const back = (msg: string) => redirect(`/login?error=${encodeURIComponent(msg)}`);

  if (!email || !password) return back("Enter your email and password.");

  // 1) Try logging in first (the common case for returning users).
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data.session) redirect("/app");

  const signInMsg = (signIn.error?.message ?? "").toLowerCase();
  if (signInMsg.includes("not confirmed")) {
    redirect(`/check-email?email=${encodeURIComponent(email)}`);
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
      return back("Incorrect password for this account. Try again, or use a magic link.");
    }
    return back(signUp.error.message);
  }

  // New account created.
  if (signUp.data.session) redirect("/app"); // confirmation disabled
  redirect(`/check-email?email=${encodeURIComponent(email)}`); // needs email confirmation
}

export async function sendMagicLink(formData: FormData) {
  const supabase = await createServerSupabase();
  const origin = (await headers()).get("origin")!;
  const { error } = await supabase.auth.signInWithOtp({
    email: String(formData.get("email")),
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  const q = error ? `error=${encodeURIComponent(error.message)}` : "sent=1";
  redirect(`/login?${q}`);
}

export async function resendConfirmation(formData: FormData) {
  const supabase = await createServerSupabase();
  const email = String(formData.get("email"));
  const origin = (await headers()).get("origin") ?? "";
  await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  redirect(`/check-email?email=${encodeURIComponent(email)}&resent=1`);
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
