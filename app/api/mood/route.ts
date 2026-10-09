import { computeChart } from "@/lib/astrology/chart";
import { createRouteSupabase } from "@/lib/supabase/route";
import { loadBirthRow } from "@/lib/timeline/load";
import { moodPatterns } from "@/lib/mood/patterns";
import { loadCheckins, saveCheckin } from "@/lib/mood/store";

export const runtime = "nodejs";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mood check-ins and what they say about the person's sky.
 * GET: the last six months and the patterns in them (lib/mood/patterns.ts).
 * POST { day, mood }: record today's, 1 to 5; a second post the same day replaces it.
 * Computed only; nothing goes to a model. `available` is false until 0014 is applied.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [{ checkins, available }, birth] = await Promise.all([loadCheckins(supabase), loadBirthRow(supabase)]);
  const natal = birth?.chart?.vedic;
  if (!natal || !birth) return Response.json({ available, checkins, summary: null });

  // The Moon at local noon in the birthplace's zone on each check-in day.
  const moons = new Map<string, { sign: string; nakshatra?: string }>();
  await Promise.all(
    checkins.map(async (c) => {
      const sky = await computeChart({ birthDate: c.day, birthTime: "12:00", lat: 0, lng: 0, timezone: birth.timezone }, "vedic");
      const moon = sky.planets.find((p) => p.name === "Moon");
      if (moon) moons.set(c.day, { sign: moon.sign, nakshatra: moon.nakshatra });
    }),
  );
  const summary = moodPatterns(natal, checkins.filter((c) => moons.has(c.day)), (day) => moons.get(day)!);
  return Response.json({ available, checkins, summary }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: { day?: unknown; mood?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { day, mood } = body;
  if (typeof day !== "string" || !ISO_DAY.test(day)) return Response.json({ error: "day must be yyyy-mm-dd" }, { status: 400 });
  if (typeof mood !== "number" || !Number.isInteger(mood) || mood < 1 || mood > 5) {
    return Response.json({ error: "mood must be 1 to 5" }, { status: 400 });
  }
  // The client sends its own calendar date; refuse anything far from now.
  const offsetDays = Math.abs(Date.parse(`${day}T12:00:00Z`) - Date.now()) / 86_400_000;
  if (offsetDays > 2) return Response.json({ error: "Check in for today" }, { status: 400 });

  const outcome = await saveCheckin(supabase, user.id, day, mood);
  if (outcome === "missing") return Response.json({ error: "Mood check-ins are not switched on yet" }, { status: 503 });
  if (outcome === "error") return Response.json({ error: "That didn't save. Try again." }, { status: 500 });
  return Response.json({ ok: true, day, mood });
}
