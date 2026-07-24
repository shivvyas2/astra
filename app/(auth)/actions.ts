"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

export async function signInWithPassword(formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/app");
}

export async function signUpWithPassword(formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  redirect("/app");
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

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
