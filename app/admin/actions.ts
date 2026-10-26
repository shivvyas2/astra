"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isAdminUser, requireAdmin } from "@/lib/admin/guard";
import { parseLimit, saveLimits, saveUserLimits } from "@/lib/admin/limits";

// Generate a one-time login link for a user (impersonate for testing) WITHOUT
// their password. Open it in a private window to sign in as that user.
export async function generateLoginLink(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email"));
  const userId = String(formData.get("user_id"));
  const origin = (await headers()).get("origin") ?? "";
  const admin = createAdminSupabase();
  const { data } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/app` },
  });
  const link = data?.properties?.action_link ?? "";
  redirect(`/admin/users/${userId}?login_link=${encodeURIComponent(link)}`);
}

// Admin-triggered password reset: sends the user a reset email (via Resend SMTP).
// We never see or store the password itself — this is the correct, secure flow.
export async function sendPasswordReset(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email"));
  const userId = String(formData.get("user_id"));
  const supabase = await createServerSupabase();
  const origin = (await headers()).get("origin") ?? "";
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/login` });
  redirect(`/admin/users/${userId}?reset=1`);
}

export async function adminSignIn(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error || !data.user) return redirect(`/admin/login?error=${encodeURIComponent(error?.message ?? "Login failed")}`);
  if (!(await isAdminUser(data.user.id))) {
    await supabase.auth.signOut();
    return redirect("/admin/login?error=Not+authorized");
  }
  redirect("/admin");
}

export async function adminSignOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

// The daily limits (lib/usage/limits.ts). Blank is "no limit". A bad value
// comes back as ?limits=invalid rather than saving half the form.
export async function updateLimits(formData: FormData) {
  const user = await requireAdmin();
  const readingsPerDay = parseLimit(formData.get("readings_per_day"), "readings");
  const usdPerUserDay = parseLimit(formData.get("usd_per_user_day"), "usd");
  const usdAllUsersDay = parseLimit(formData.get("usd_all_users_day"), "usd");
  if (readingsPerDay === undefined || usdPerUserDay === undefined || usdAllUsersDay === undefined) {
    redirect("/admin?limits=invalid#limits");
  }
  await saveLimits(createAdminSupabase(), { readingsPerDay, usdPerUserDay, usdAllUsersDay }, user.id);
  redirect("/admin?limits=saved#limits");
}

// One user's overrides. Blank uses the default; both blank removes the override.
export async function updateUserLimits(formData: FormData) {
  const user = await requireAdmin();
  const userId = String(formData.get("user_id"));
  const readingsPerDay = parseLimit(formData.get("readings_per_day"), "readings");
  const usdPerUserDay = parseLimit(formData.get("usd_per_user_day"), "usd");
  if (readingsPerDay === undefined || usdPerUserDay === undefined) {
    redirect(`/admin/users/${userId}?limits=invalid`);
  }
  await saveUserLimits(createAdminSupabase(), userId, { readingsPerDay, usdPerUserDay }, user.id);
  redirect(`/admin/users/${userId}?limits=saved`);
}
