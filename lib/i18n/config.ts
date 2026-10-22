import type { ReadingLanguage } from "@/lib/astrology/language";

/**
 * The site's own languages, and how a request picks one. There is no URL
 * prefix: the reading language a signed-in person chose (birth_profiles,
 * the same setting the app and the readings use) decides, then the
 * `astrya-lang` cookie a visitor set, then the browser's Accept-Language,
 * then English.
 *
 * Client-safe: no server imports.
 */
export const LOCALES = ["en", "hi", "gu"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Set when the language is chosen, so signed-out pages follow it too. */
export const LOCALE_COOKIE = "astrya-lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Sanskrit terms is English prose, so the site around it is English too. */
export function localeForLanguage(language: ReadingLanguage): Locale {
  if (language === "hindi") return "hi";
  if (language === "gujarati") return "gu";
  return "en";
}

export function languageForLocale(locale: Locale): ReadingLanguage {
  if (locale === "hi") return "hindi";
  if (locale === "gu") return "gujarati";
  return "english";
}

/** Each option as it is shown, in its own script. */
export const LOCALE_LABEL: Record<Locale, string> = { en: "English", hi: "हिन्दी", gu: "ગુજરાતી" };

/**
 * The supported language the browser ranks highest, or null. "hi-IN" counts
 * as Hindi; a tag with q=0 is a refusal; ties keep the browser's order.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  let best: { locale: Locale; q: number } | null = null;
  for (const part of header.split(",")) {
    const [tag, ...params] = part.trim().split(";");
    const primary = tag.trim().toLowerCase().split("-")[0];
    if (!isLocale(primary)) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { locale: primary, q };
  }
  return best?.locale ?? null;
}

/** Stored language, then cookie, then Accept-Language, then English. */
export function resolveLocale(input: {
  stored?: ReadingLanguage | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (input.stored) return localeForLanguage(input.stored);
  if (isLocale(input.cookie)) return input.cookie;
  return localeFromAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}

/**
 * The Intl locale for dates: the language with Western digits, which is how
 * dates are written in everyday Hindi and Gujarati on screens.
 */
export function intlLocale(locale: Locale, english = "en-US"): string {
  if (locale === "hi") return "hi-IN-u-nu-latn";
  if (locale === "gu") return "gu-IN-u-nu-latn";
  return english;
}
