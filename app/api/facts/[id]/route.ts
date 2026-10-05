import { createRouteSupabase } from "@/lib/supabase/route";
import { isMissingTable, logFactsError } from "@/lib/facts/store";
import { isUuid } from "@/lib/facts/types";

export const runtime = "nodejs";

/** Deletes one fact. Scoped to the caller by RLS and by the explicit filter. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("user_facts").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    if (isMissingTable(error)) return Response.json({ ok: true });
    logFactsError("delete", error);
    return Response.json({ error: "Could not remove that." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
