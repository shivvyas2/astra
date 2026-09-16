import { createRouteSupabase } from "@/lib/supabase/route";
import { loadTimeline, loadScanState } from "@/lib/timeline/load";

export const runtime = "nodejs";

/**
 * The user's life as Vimshottari divides it, with their own pinned events
 * placed inside each period and the plain-language meaning of each period
 * where one has been written.
 *
 * `needsExplaining` tells the client to call `POST /api/timeline/explain` in
 * the background. `scanned` and `messagesSinceScan` decide whether to offer
 * mining the chat history: once when never done, and again once the user has
 * said enough new things to be worth another look.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [timeline, scan] = await Promise.all([loadTimeline(supabase), loadScanState(supabase)]);
  if (!timeline) {
    return Response.json({ error: "Complete your birth details first." }, { status: 400 });
  }

  return Response.json({ ...timeline, ...scan });
}
