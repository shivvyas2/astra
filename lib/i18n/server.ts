import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { isReadingLanguage, type ReadingLanguage } from "@/lib/astrology/language";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import type { I18n } from "./core";
import { i18nFor, LEGAL } from "./dictionaries";

/** The path the middleware saw, so the admin dashboard can stay in English. */
export const PATH_HEADER = "x-astrya-path";

/** Supabase keeps the session in `sb-<project>-auth-token` (chunked as .0, .1). */
function hasSession(names: string[]): boolean {
  return names.some((n) => n.startsWith("sb-") && n.includes("-auth-token"));
}

/**
 * The reading language this person stored, or null when signed out, before
 * intake, or before migration 0017. Unlike loadReadingLanguage this tells
 * "chose English" from "has not chosen", so a visitor's cookie still counts
 * until there is a profile.
 */
async function storedLanguage(): Promise<ReadingLanguage | null> {
  try {
    const db = await createServerSupabase();
    const { data, error } = await db.from("birth_profiles").select("reading_language").maybeSingle();
    if (error) return null;
    const value = (data as { reading_language?: unknown } | null)?.reading_language;
    return isReadingLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

/** The active locale, worked out once per request. */
export const getLocale = cache(async (): Promise<Locale> => {
  const [jar, head] = await Promise.all([cookies(), headers()]);
  if (head.get(PATH_HEADER)?.startsWith("/admin")) return "en";
  // Only a request with a session can have a stored language; skip the
  // query for every signed-out visitor.
  const stored = hasSession(jar.getAll().map((c) => c.name)) ? await storedLanguage() : null;
  return resolveLocale({
    stored,
    cookie: jar.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: head.get("accept-language"),
  });
});

/** `const { t, f } = await getI18n()` in a server component or route handler. */
export const getI18n = cache(async (): Promise<I18n> => i18nFor(await getLocale()));

export async function getLegal() {
  const locale = await getLocale();
  return { locale, legal: LEGAL[locale] };
}
