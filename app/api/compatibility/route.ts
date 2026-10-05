import { createRouteSupabase } from "@/lib/supabase/route";
import { ensureCurrentChart, type BirthProfileRow } from "@/lib/data/birthProfile";
import { getPerson, WRITE_ERROR } from "@/lib/profiles/store";
import { computeCompatibility, type ChartPair } from "@/lib/compat/compatibility";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GET /api/compatibility?with=<personId>[&groom=them]`
 *
 * Guna Milan (36 points) and Western synastry between the caller's chart and
 * one of their saved people, plus a deterministic summary and a suggested
 * question for Ask. Nothing here calls a model; see lib/compat.
 *
 * The classical tables read one chart as the groom's and one as the bride's.
 * `groom` says whose ("you", the default, or "them"); the answer always
 * carries the total the other way round as well.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const withId = url.searchParams.get("with") ?? "";
  if (!UUID.test(withId)) return Response.json({ error: "Choose someone to compare with." }, { status: 400 });
  const groom = url.searchParams.get("groom") === "them" ? "them" : "you";

  const { data: loaded, error } = await supabase.from("birth_profiles").select("*").maybeSingle();
  if (error) {
    console.error("compatibility profile read error", error);
    return Response.json({ error: "Something went wrong loading your chart. Please try again." }, { status: 500 });
  }
  if (!loaded?.chart) return Response.json({ error: "Add your own birth details first." }, { status: 400 });
  const me = await ensureCurrentChart(loaded as BirthProfileRow, supabase);

  const { person, available } = await getPerson(supabase, withId);
  if (!available) return Response.json({ error: WRITE_ERROR.unavailable.message }, { status: 503 });
  if (!person?.chart) return Response.json({ error: WRITE_ERROR.not_found.message }, { status: 404 });

  try {
    const result = computeCompatibility({
      you: { name: me.first_name, chart: me.chart as unknown as ChartPair },
      them: { name: person.label || person.first_name, relationship: person.relationship, chart: person.chart as unknown as ChartPair },
      groom,
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("compatibility compute error", err);
    return Response.json({ error: "Could not compare these charts. Please try again." }, { status: 500 });
  }
}
