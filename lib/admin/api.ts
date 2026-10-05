import "server-only";
import type { User } from "@supabase/supabase-js";
import { bearerTokenFrom, createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Auth for the admin JSON API (/api/admin/*), shared by the web admin's
 * cookies and the iOS app's `Authorization: Bearer <access_token>`.
 *
 * Signed out is 401. Signed in but not in `admins` is 403 {error:'forbidden'}.
 * Everything after the check reads with the service role.
 */

type AdminsDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The caller, from cookies or a bearer token. Null when signed out or the token is invalid. */
export async function signedInUser(request: Request): Promise<User | null> {
  try {
    const supabase = await createRouteSupabase(request);
    const token = bearerTokenFrom(request);
    const { data } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

/** True when the user has a row in `admins`. False on any error. */
export async function isAdminId(db: AdminsDb, userId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export type AdminContext = { user: User; db: ReturnType<typeof createAdminSupabase> };

/** The admin context, or the 401/403 response to return instead. */
export async function requireAdminApi(request: Request): Promise<AdminContext | Response> {
  const user = await signedInUser(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  let db: ReturnType<typeof createAdminSupabase>;
  try {
    db = createAdminSupabase();
  } catch (err) {
    console.error("admin api: service client unavailable", err);
    return json({ error: "forbidden" }, 403);
  }
  if (!(await isAdminId(db, user.id))) return json({ error: "forbidden" }, 403);
  return { user, db };
}

/** Wraps a handler body so an unexpected failure is a JSON 500, not an HTML page. */
export async function safely(where: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    console.error(`admin api ${where} error`, err);
    return json({ error: "internal" }, 500);
  }
}
