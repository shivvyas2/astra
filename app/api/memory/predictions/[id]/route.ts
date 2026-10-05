import { createRouteSupabase } from "@/lib/supabase/route";
import { isUuid } from "@/lib/facts/types";
import { deletePrediction, setPredictionStatus } from "@/lib/memory/store";
import { isPredictionStatus } from "@/lib/memory/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** "Did this happen?" — body `{ status: "happened" | "didnt" | "unsure" | "open" }`. */
export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Missing id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  if (!isPredictionStatus(body?.status)) return Response.json({ error: "Invalid status" }, { status: 400 });

  const result = await setPredictionStatus(supabase, { userId: user.id, id, status: body.status });
  if (result === "missing") return Response.json({ error: "Predictions are not switched on yet." }, { status: 404 });
  if (result === "error") return Response.json({ error: "Could not save that." }, { status: 500 });
  return Response.json({ ok: true });
}

/** Forgets one prediction. */
export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Missing id" }, { status: 400 });

  const result = await deletePrediction(supabase, user.id, id);
  if (result === "error") return Response.json({ error: "Could not remove that." }, { status: 500 });
  return Response.json({ ok: true });
}
