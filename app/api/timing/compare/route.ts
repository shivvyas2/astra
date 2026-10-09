import { computeChart } from "@/lib/astrology/chart";
import { createRouteSupabase } from "@/lib/supabase/route";
import { loadBirthRow } from "@/lib/timeline/load";
import { compareDays } from "@/lib/timing/compare";
import { TOPICS, type Topic } from "@/lib/memory/types";

export const runtime = "nodejs";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Two dates for one decision, read against the caller's chart:
 * `GET /api/timing/compare?a=2026-11-03&b=2026-12-01&topic=career`.
 * Computed only (lib/timing/compare.ts); nothing goes to a model.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const a = url.searchParams.get("a") ?? "";
  const b = url.searchParams.get("b") ?? "";
  const topicParam = url.searchParams.get("topic");
  if (!ISO_DAY.test(a) || !ISO_DAY.test(b)) return Response.json({ error: "Give two dates as yyyy-mm-dd" }, { status: 400 });
  const topic = topicParam && (TOPICS as readonly string[]).includes(topicParam) && topicParam !== "general" ? (topicParam as Topic) : null;

  const birth = await loadBirthRow(supabase);
  const natal = birth?.chart?.vedic;
  if (!birth || !natal) return Response.json({ error: "No chart yet" }, { status: 404 });

  // The Moon at local noon where they were born: planet positions do not
  // depend on the place, only the clock does.
  const skyOn = (day: string) => computeChart({ birthDate: day, birthTime: "12:00", lat: 0, lng: 0, timezone: birth.timezone }, "vedic");
  const [skyA, skyB] = await Promise.all([skyOn(a), skyOn(b)]);
  return Response.json(compareDays(natal, { date: a, sky: skyA }, { date: b, sky: skyB }, topic), {
    headers: { "cache-control": "private, max-age=3600" },
  });
}
