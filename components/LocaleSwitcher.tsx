"use client";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABEL,
  languageForLocale,
  type Locale,
} from "@/lib/i18n/config";

/**
 * English, हिन्दी, ગુજરાતી for pages a visitor sees before signing in. Sets
 * the `astrya-lang` cookie and refreshes, so the server components render
 * again in the choice. A signed-in visitor's stored language outranks the
 * cookie, so it is saved there as well; signed out, that request is a 401
 * and the cookie alone carries it.
 */
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();

  async function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    await fetch("/api/profile/language", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: languageForLocale(next) }),
    }).catch(() => null);
    router.refresh();
  }

  return (
    <div role="group" aria-label={t.language.switcher} className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => void choose(l)}
          className={`text-xs underline-offset-4 transition-colors hover:text-fg ${l === locale ? "font-semibold text-fg" : "text-muted underline"}`}
        >
          {LOCALE_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
