import "server-only";
import { isReadingLanguage } from "@/lib/astrology/language";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import type { I18n } from "./core";
import { i18nFor } from "./dictionaries";

type LanguageDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The locale for a route handler's own words (an error a browser shows as
 * the page), with the route's Supabase client, which is signed in by cookie
 * on the web and by bearer token from the iPhone. Same order as getLocale:
 * stored language, cookie, Accept-Language, English.
 */
export async function routeLocale(request: Request, db: LanguageDb): Promise<Locale> {
  let stored = null;
  try {
    const { data, error } = await db.from("birth_profiles").select("reading_language").maybeSingle();
    const value = error ? null : (data as { reading_language?: unknown } | null)?.reading_language;
    stored = isReadingLanguage(value) ? value : null;
  } catch {
    stored = null;
  }
  const cookie = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([name]) => name === LOCALE_COOKIE)?.[1];
  return resolveLocale({ stored, cookie, acceptLanguage: request.headers.get("accept-language") });
}

export async function routeI18n(request: Request, db: LanguageDb): Promise<I18n> {
  return i18nFor(await routeLocale(request, db));
}
