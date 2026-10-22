import { createRouteSupabase } from "@/lib/supabase/route";
import { isReadingLanguage, loadReadingLanguage } from "@/lib/astrology/language";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, localeForLanguage } from "@/lib/i18n/config";

export const runtime = "nodejs";

/** `GET /api/profile/language`: `{ language }`, English when unset. */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  return Response.json({ language: await loadReadingLanguage(supabase) });
}

/**
 * `PUT /api/profile/language` with `{ language }`: the language readings are
 * written in, and the site's language too. The `astrya-lang` cookie it sets
 * keeps the signed-out pages (and this browser after sign-out) in step.
 */
export async function PUT(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { language } = (await request.json().catch(() => ({}))) as { language?: unknown };
  if (!isReadingLanguage(language)) return Response.json({ error: "Choose English, Hindi, Gujarati or Sanskrit terms." }, { status: 400 });
  const { error } = await supabase.from("birth_profiles").update({ reading_language: language }).eq("user_id", user.id);
  if (error) {
    console.error("reading language save error", error);
    return Response.json({ error: "Could not save the language. Is migration 0017 applied?" }, { status: 500 });
  }
  // The life map's explanations are cached in the old language. Clearing
  // them makes the next open write them again in the new one.
  await supabase.from("period_readings").delete().eq("user_id", user.id);
  return Response.json(
    { language },
    { headers: { "set-cookie": `${LOCALE_COOKIE}=${localeForLanguage(language)}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax` } },
  );
}
