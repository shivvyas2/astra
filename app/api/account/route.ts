import { createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Permanently deletes the calling user's account.
 * Required by App Store Review Guideline 5.1.1(v).
 *
 * The user id comes from the verified session, never from the request body,
 * so a caller can only ever delete themselves. Rows in profiles,
 * birth_profiles, conversations, and messages cascade from auth.users.
 */
export async function DELETE(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const admin = createAdminSupabase();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("account deletion error", error);
    return Response.json({ error: "Could not delete your account. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
