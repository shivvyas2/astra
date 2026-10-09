"use client";
import { useState } from "react";
import type { Comparison, DayReading } from "@/lib/timing/compare";
import { TOPICS, TOPIC_LABEL } from "@/lib/memory/types";

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Two dates for one decision, side by side, from GET /api/timing/compare. */
export function CompareDates({ today }: { today: string }) {
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
      setError("Those dates couldn't be read. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="brut-card mt-10 p-5 sm:p-6" aria-labelledby="compare-heading">
      <p className="screen-eyebrow">Decide</p>
      <h2 id="compare-heading" className="headline mt-3 text-3xl">Compare two dates</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Signing, a move, a launch: put two days side by side against your chart.
      </p>
      <form onSubmit={compare} className="mt-6 grid gap-5 sm:grid-cols-3">
        <label className="block">
          <span className="eyebrow block">First date</span>
          <input type="date" required min={today} value={a} onChange={(e) => setA(e.target.value)} className="brut-field [color-scheme:dark]" />
        </label>
        <label className="block">
          <span className="eyebrow block">Second date</span>
          <input type="date" required min={today} value={b} onChange={(e) => setB(e.target.value)} className="brut-field [color-scheme:dark]" />
        </label>
        <label className="block">
          <span className="eyebrow block">It&apos;s about</span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className="brut-field cursor-pointer [color-scheme:dark]">
            <option value="">Anything</option>
            {TOPICS.filter((t) => t !== "general").map((t) => (
              <option key={t} value={t}>{TOPIC_LABEL[t]}</option>
            ))}
          </select>
        </label>
        <button disabled={busy || !a || !b} className="brut-btn brut-btn-primary brut-btn-arrow min-h-[48px] sm:col-span-3">
          {busy ? "Reading…" : "Compare"}
        </button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-ember">{error}</p>}
      {result && (
        <div className="mt-6">
          <p className="text-[15px] font-semibold">
            {result.better === "even"
              ? "Neither date stands out: they read about the same."
              : `${longDate(result[result.better].date)} reads better.`}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Day reading={result.a} best={result.better === "a"} />
            <Day reading={result.b} best={result.better === "b"} />
          </div>
          <p className="mt-3 text-xs text-muted">Read with the Moon at noon in your birthplace&apos;s time zone. Classical muhurta, computed from your chart.</p>
        </div>
      )}
    </section>
  );
}

function Day({ reading, best }: { reading: DayReading; best: boolean }) {
  return (
    <div className={`rounded-[14px] border p-4 ${best ? "border-accent bg-accent/[0.06]" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{longDate(reading.date)}</p>
        {best && <span className="brut-tag">Better</span>}
      </div>
      <p className="mt-2 text-4xl font-light tabular-nums tracking-tight">
        {reading.score > 0 ? `+${reading.score}` : reading.score}
      </p>
      <ul className="mt-3 space-y-2">
        {reading.factors.map((f, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span aria-hidden className={`mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full ${f.score > 0 ? "bg-accent" : f.score < 0 ? "bg-ember" : "bg-muted"}`} />
            <span><span className="font-medium">{f.label}.</span> <span className="text-muted">{f.detail}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
