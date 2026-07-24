import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

export async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  if (!(await isAdminUser(user.id))) redirect("/admin/login?error=Not+authorized");
  return user;
}
