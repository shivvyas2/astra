import { createAdminSupabase } from "@/lib/supabase/admin";
import { isAdminId, json, signedInUser } from "@/lib/admin/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `{ isAdmin }` for any signed-in user (cookies or bearer). Never 403; 401 when signed out. */
export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  let isAdmin = false;
  try {
    isAdmin = await isAdminId(createAdminSupabase(), user.id);
  } catch {
    isAdmin = false;
  }
  return json({ isAdmin });
}
