import { createRouteSupabase } from "@/lib/supabase/route";
import { loadBirthRow, loadTimeline, loadScanState } from "@/lib/timeline/load";
import { explainTimeline, eventsHashFor, NOW_LORD } from "@/lib/timeline/explain";
import { requireConsent } from "@/lib/billing/consent";

export const runtime = "nodejs";
// One model call that covers the whole life; longer than a chat turn.
export const maxDuration = 90;

/**
 * Writes, or rewrites, the plain-language meaning of every period.
 *
 * All twelve periods and the "now" summary come from one call, so any stale
 * period refreshes all of them: the extra output costs less than a second
 * call would. A model failure leaves the rows that exist untouched and
 * returns the timeline with `needsExplaining` still true, so the client can
 * try again on the next open rather than showing an error.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // AI consent (App Store 5.1.2), as the chat route does.
  const consentBlock = await requireConsent(supabase, user.id);
  if (consentBlock) return consentBlock;

  const row = await loadBirthRow(supabase);
  const timeline = row ? await loadTimeline(supabase, row) : null;
  if (!row || !timeline) {
    return Response.json({ error: "Complete your birth details first." }, { status: 400 });
  }

  if (timeline.needsExplaining) {
    const explanations = await explainTimeline({
      firstName: row.first_name,
      birthDate: timeline.birthDate,
      today: timeline.today,
      timeline,
      userId: user.id,
    });

    if (explanations.length > 0) {
      const rows = explanations.map((e) => {
        const period = timeline.periods.find((p) => p.lord === e.lord && p.start === e.periodStart);
        return {
          user_id: user.id,
          lord: e.lord,
          period_start: e.periodStart,
          theme: e.theme,
          meaning: e.meaning,
          // The now row has no moments of its own; its freshness is the
          // antardasha start in its key.
          events_hash: e.lord === NOW_LORD || !period ? "0" : eventsHashFor(period, timeline.events),
          generated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase
        .from("period_readings")
        .upsert(rows, { onConflict: "user_id,lord,period_start" });
      if (error) console.error("period readings upsert error", error);
    }
  }

  const [fresh, scan] = await Promise.all([loadTimeline(supabase, row), loadScanState(supabase)]);
  return Response.json({ ...fresh, ...scan });
}
