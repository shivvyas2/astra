import { createRouteSupabase } from "@/lib/supabase/route";
import { loadTiming } from "@/lib/timing/load";
import { timingIcs } from "@/lib/timing/ics";
import { routeI18n } from "@/lib/i18n/route";
import { shortDate, timingText } from "@/lib/i18n/astro";

export const runtime = "nodejs";

/** Key dates as an .ics file to add to Apple, Google or Outlook calendars. */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const timing = await loadTiming(supabase);
  if (!timing) return Response.json({ error: "No chart yet" }, { status: 404 });
  // The events land in the person's own calendar, so they are in their language.
  const i18n = await routeI18n(request, supabase);
  const { t, f } = i18n;
  const words =
    i18n.locale === "en"
      ? undefined
      : {
          calendarName: t.keyDates.calendarName,
          tone: t.keyDates.tone,
          closes: (date: string) => f(t.keyDates.windowCloses, { date: shortDate(i18n, date) }),
          computed: t.keyDates.computed,
          text: (e: (typeof timing.events)[number]) => timingText(i18n, e),
        };
  return new Response(timingIcs(timing.events, new Date(), words), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="astrya-key-dates.ics"',
      "cache-control": "private, no-store",
    },
  });
}
