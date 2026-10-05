import { createRouteSupabase } from "@/lib/supabase/route";
import { isUuid } from "@/lib/facts/types";
import { deleteMemory } from "@/lib/memory/store";

export const runtime = "nodejs";

/**
 * Forgets one conversation's summary. The id is the conversation's; the
 * transcript itself is kept. Scoped to the caller by RLS and by the filter.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Missing id" }, { status: 400 });

  const result = await deleteMemory(supabase, user.id, id);
  if (result === "error") return Response.json({ error: "Could not remove that." }, { status: 500 });
  return Response.json({ ok: true });
}
