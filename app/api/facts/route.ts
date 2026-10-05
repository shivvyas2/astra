import { createRouteSupabase } from "@/lib/supabase/route";
import { isMissingTable, loadFacts, logFactsError } from "@/lib/facts/store";

export const runtime = "nodejs";

/**
 * "What Astrya knows": the standing facts learned from the caller's chats,
 * newest first. Read through the caller's own session, so RLS scopes it.
 *
 * `available` is false while the user_facts table has not been created in
 * this database; clients show the empty state either way.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { facts, available } = await loadFacts(supabase, 100);
  return Response.json({ facts, available }, { headers: { "cache-control": "no-store" } });
}

/** Forget everything: deletes every fact the caller has. */
export async function DELETE(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { error } = await supabase.from("user_facts").delete().eq("user_id", user.id);
  if (error) {
    // No table means nothing was ever stored: already forgotten.
    if (isMissingTable(error)) return Response.json({ ok: true });
    logFactsError("delete all", error);
    return Response.json({ error: "Could not forget that. Please try again." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
