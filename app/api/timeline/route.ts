import { createRouteSupabase } from "@/lib/supabase/route";
import { loadTimeline } from "@/lib/timeline/load";

export const runtime = "nodejs";

/**
 * The user's life as Vimshottari divides it, with their own pinned events
 * placed inside each period.
 *
 * `scanned` tells the client whether we have already mined their chat history
 * for events, so the "we found some moments" offer appears once rather than on
 * every open.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const timeline = await loadTimeline(supabase);
  if (!timeline) {
    return Response.json({ error: "Complete your birth details first." }, { status: 400 });
  }

  const { data: scan } = await supabase
    .from("life_event_scans")
    .select("scanned_at")
    .maybeSingle();

  return Response.json({ ...timeline, scanned: Boolean(scan) });
}
