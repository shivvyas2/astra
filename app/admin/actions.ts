"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin/guard";

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
