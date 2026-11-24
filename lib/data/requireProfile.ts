import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * For every signed-in page that means nothing without a chart: someone who
 * has not entered birth details goes there first. A failed read lets the page
 * through rather than sending someone with a chart to fill it in again.
 */
export async function requireBirthProfile(): Promise<void> {
  const db = await createServerSupabase();
  const { data, error } = await db.from("birth_profiles").select("user_id").not("chart", "is", null).maybeSingle();
  if (error) {
    console.error("birth profile check failed", error);
    return;
  }
  if (!data) redirect("/app/intake");
}
