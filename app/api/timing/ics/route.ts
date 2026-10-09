import { createRouteSupabase } from "@/lib/supabase/route";
import { loadTiming } from "@/lib/timing/load";
import { timingIcs } from "@/lib/timing/ics";

export const runtime = "nodejs";

/** Key dates as an .ics file to add to Apple, Google or Outlook calendars. */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const timing = await loadTiming(supabase);
  if (!timing) return Response.json({ error: "No chart yet" }, { status: 404 });
  return new Response(timingIcs(timing.events), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="astrya-key-dates.ics"',
      "cache-control": "private, no-store",
    },
  });
}
