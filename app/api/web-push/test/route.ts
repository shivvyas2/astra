import { createRouteSupabase } from "@/lib/supabase/route";
import { isWebPushConfigured, pushToWebSubscriptions } from "@/lib/push/web";

export const runtime = "nodejs";

/**
 * `POST /api/web-push/test` sends a test notification to the signed-in
 * user's own browsers now, and says what the push services answered.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!isWebPushConfigured()) {
    return Response.json({ configured: false, results: [] });
  }
  const results = await pushToWebSubscriptions(supabase, user.id, {
    title: "Test notification",
    body: "If you can see this, Astrya's notifications work in this browser.",
    alertId: "test",
    threadId: "astrya-test",
  });
  return Response.json({ configured: true, results });
}
