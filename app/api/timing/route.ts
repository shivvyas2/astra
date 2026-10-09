import { createRouteSupabase } from "@/lib/supabase/route";
import { loadTiming } from "@/lib/timing/load";

export const runtime = "nodejs";

/**
 * Key dates: the timing engine's windows for the next twelve months, computed
 * from the caller's chart. Nothing here goes to a model, so no AI consent is
 * needed. 404 before intake.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const timing = await loadTiming(supabase);
  if (!timing) return Response.json({ error: "No chart yet" }, { status: 404 });
  return Response.json(timing, { headers: { "cache-control": "private, max-age=3600" } });
}
