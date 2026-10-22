"use client";
import { useState } from "react";
import type { Comparison, DayReading } from "@/lib/timing/compare";
import { TOPICS } from "@/lib/memory/types";
import { useI18n } from "@/lib/i18n/client";
import type { I18n } from "@/lib/i18n/core";
import { factorText } from "@/lib/i18n/astro";

function longDate(i: I18n, iso: string) {
  return i.date(`${iso}T12:00:00Z`, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }, "en-GB");
}

/** Two dates for one decision, side by side, from GET /api/timing/compare. */
export function CompareDates({ today }: { today: string }) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const c = t.compare;
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compare(e: React.FormEvent) {
    e.preventDefault();
    if (!a || !b) return;
    setBusy(true);
    setError(null);
    try {
      const q = new URLSearchParams({ a, b, ...(topic ? { topic } : {}) });
      const res = await fetch(`/api/timing/compare?${q}`);
      if (!res.ok) throw new Error(String(res.status));
      setResult((await res.json()) as Comparison);
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="brut-card mt-10 p-5 sm:p-6" aria-labelledby="compare-heading">
      <p className="screen-eyebrow">{c.eyebrow}</p>
      <h2 id="compare-heading" className="headline mt-3 text-3xl">{c.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{c.blurb}</p>
      <form onSubmit={compare} className="mt-6 grid gap-5 sm:grid-cols-3">
        <label className="block">
          <span className="eyebrow block">{c.first}</span>
          <input type="date" required min={today} value={a} onChange={(e) => setA(e.target.value)} className="brut-field [color-scheme:dark]" />
        </label>
        <label className="block">
          <span className="eyebrow block">{c.second}</span>
          <input type="date" required min={today} value={b} onChange={(e) => setB(e.target.value)} className="brut-field [color-scheme:dark]" />
        </label>
        <label className="block">
          <span className="eyebrow block">{c.about}</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className="brut-field cursor-pointer [color-scheme:dark]">
            <option value="">{c.anything}</option>
            {TOPICS.filter((topic) => topic !== "general").map((topic) => (
              <option key={topic} value={topic}>{t.topics[topic]}</option>
            ))}
          </select>
        </label>
        <button disabled={busy || !a || !b} className="brut-btn brut-btn-primary brut-btn-arrow min-h-[48px] sm:col-span-3">
          {busy ? c.reading : c.compare}
        </button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-ember">{error}</p>}
      {result && (
        <div className="mt-6">
          <p className="text-[15px] font-semibold">
            {result.better === "even" ? c.even : f(c.better, { date: longDate(i18n, result[result.better].date) })}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Day reading={result.a} best={result.better === "a"} />
            <Day reading={result.b} best={result.better === "b"} />
          </div>
          <p className="mt-3 text-xs text-muted">{c.footnote}</p>
        </div>
      )}
    </section>
  );
}

function Day({ reading, best }: { reading: DayReading; best: boolean }) {
  const i18n = useI18n();
  return (
    <div className={`rounded-[14px] border p-4 ${best ? "border-accent bg-accent/[0.06]" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{longDate(i18n, reading.date)}</p>
        {best && <span className="brut-tag">{i18n.t.compare.betterTag}</span>}
      </div>
      <p className="mt-2 text-4xl font-light tabular-nums tracking-tight">
        {reading.score > 0 ? `+${reading.score}` : reading.score}
      </p>
      <ul className="mt-3 space-y-2">
        {reading.factors.map((factor, i) => {
          const { label, detail } = factorText(i18n, factor);
          return (
            <li key={i} className="flex gap-2 text-sm">
              <span aria-hidden className={`mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full ${factor.score > 0 ? "bg-accent" : factor.score < 0 ? "bg-ember" : "bg-muted"}`} />
              <span><span className="font-medium">{label}.</span> <span className="text-muted">{detail}</span></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
