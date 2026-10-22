"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_LABEL, READING_LANGUAGES, type ReadingLanguage } from "@/lib/astrology/language";
import { useI18n } from "@/lib/i18n/client";

/**
 * The one language setting: the site, the app and the readings (Ask, the
 * morning and evening readings, alerts and the life map). Saved at once;
 * the route sets the `astrya-lang` cookie and the refresh re-renders the
 * server components in the new language.
 */
export function LanguagePicker({ initial }: { initial: ReadingLanguage }) {
  const router = useRouter();
  const { t } = useI18n();
  const [language, setLanguage] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(next: ReadingLanguage) {
    const previous = language;
    setLanguage(next);
    setMessage(null);
    const res = await fetch("/api/profile/language", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setLanguage(previous);
      setMessage(t.language.saveError);
    } else {
      setMessage(null);
      router.refresh();
    }
  }

  const label = (l: ReadingLanguage) => (l === "sanskrit" ? t.language.sanskrit : LANGUAGE_LABEL[l]);

  return (
    <section className="mt-6">
      <p className="eyebrow">{t.language.label}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t.language.label}>
        {READING_LANGUAGES.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={language === l}
            onClick={() => language !== l && void choose(l)}
            className={`brut-chip${language === l ? " is-active" : ""}`}
          >
            {label(l)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted" role={message ? "alert" : undefined}>
        {message ?? t.language.helper}
      </p>
    </section>
  );
}
