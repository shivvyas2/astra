"use client";
import { useState } from "react";
import { LANGUAGE_LABEL, READING_LANGUAGES, type ReadingLanguage } from "@/lib/astrology/language";

/**
 * The language readings are written in: Ask, the morning and evening
 * readings, alerts and the life map. Saved at once; the next reading uses it.
 */
export function LanguagePicker({ initial }: { initial: ReadingLanguage }) {
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
    });
    if (!res.ok) {
      setLanguage(previous);
      setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save the language.");
    } else {
      setMessage("Saved. Your next reading uses it.");
    }
  }

  return (
    <section className="mt-6">
      <p className="eyebrow">Reading language</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Reading language">
        {READING_LANGUAGES.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={language === l}
            onClick={() => language !== l && void choose(l)}
            className={`brut-chip${language === l ? " is-active" : ""}`}
          >
            {LANGUAGE_LABEL[l]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {message ?? "Readings, alerts and notifications are written in this language. Sanskrit terms keeps English but uses Surya, Mesha, bhava and so on."}
      </p>
    </section>
  );
}
