"use client";
import { useEffect, useState } from "react";
import type { MoodSummary } from "@/lib/mood/patterns";

const FACES = [
  { mood: 1, label: "Rough" },
  { mood: 2, label: "Low" },
  { mood: 3, label: "Okay" },
  { mood: 4, label: "Good" },
  { mood: 5, label: "Great" },
];

/** The person's own calendar date, yyyy-mm-dd. */
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * One tap a day, and over time what the taps say about the person's sky.
 * Hides itself until the mood table exists (GET /api/mood says available).
 */
export function MoodCheckin({ className = "" }: { className?: string }) {
  const [available, setAvailable] = useState(false);
  const [today, setToday] = useState<number | null>(null);
  const [summary, setSummary] = useState<MoodSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/mood");
      if (!res.ok) return;
      const body = (await res.json()) as { available: boolean; checkins: { day: string; mood: number }[]; summary: MoodSummary | null };
      setAvailable(body.available);
      setToday(body.checkins.find((c) => c.day === localDay())?.mood ?? null);
      setSummary(body.summary);
    } catch {
      /* the card stays hidden */
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function pick(mood: number) {
    const before = today;
    setToday(mood);
    setError(null);
    try {
      const res = await fetch("/api/mood", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ day: localDay(), mood }),
      });
      if (!res.ok) throw new Error(String(res.status));
      void load();
    } catch {
      setToday(before);
      setError("That didn't save. Try again.");
    }
  }

  if (!available) return null;

  return (
    <section className={`brut-card p-5 sm:p-6 ${className}`} aria-labelledby="mood-heading">
      <p className="eyebrow">Check in</p>
      <h2 id="mood-heading" className="headline mt-3 text-2xl">How was today?</h2>
      <div className="mt-4 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Today's mood">
        {FACES.map((f) => {
          const on = today === f.mood;
          return (
            <button
              key={f.mood}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(f.mood)}
              className={`flex flex-col items-center gap-1 rounded-[14px] border py-3 transition-colors ${
                on ? "border-accent bg-accent text-ink" : "border-line bg-fg/[0.04] hover:border-fg"
              }`}
            >
              <span className="text-xl font-light tabular-nums">{f.mood}</span>
              <span className="text-[11px] font-medium">{f.label}</span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-ember">{error}</p>}

      <div className="mt-5 border-t border-rule pt-4">
        <p className="eyebrow">Your pattern</p>
        {summary && summary.patterns.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {summary.patterns.map((p) => (
              <li key={p.key} className="text-sm leading-relaxed">
                <span className="font-semibold">{p.label}.</span> <span className="text-muted">{p.sentence}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {summary && summary.needed > 0
              ? `Check in for ${summary.needed} more ${summary.needed === 1 ? "day" : "days"} and Astrya will compare your days with where the Moon was for you.`
              : "No clear pattern yet between your days and the Moon. That is an answer too; it keeps checking."}
          </p>
        )}
      </div>
    </section>
  );
}
