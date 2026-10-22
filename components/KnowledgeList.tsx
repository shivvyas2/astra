"use client";
import { AccuracyCard } from "@/components/AccuracyCard";
import { scorecard } from "@/lib/memory/scorecard";
import { useState, type ReactNode } from "react";
import { groupFacts, type UserFact } from "@/lib/facts/types";
import { useI18n } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/config";
import {
  canCheck,
  orderPredictions,
  windowLabel,
  type ConversationMemory,
  type Prediction,
  type PredictionStatus,
} from "@/lib/memory/types";

/**
 * "What Astrya knows": the standing facts learned from the user's chats,
 * grouped by category; the summaries of past conversations; and the
 * predictions readings have made, with "Did this happen?" on the ones whose
 * window has begun. Every row is deletable. Changes are optimistic — the row
 * changes at once and comes back only if the server refuses.
 */
export function KnowledgeList({
  initial,
  summaries: initialSummaries = [],
  predictions: initialPredictions = [],
}: {
  initial: UserFact[];
  summaries?: ConversationMemory[];
  predictions?: Prediction[];
}) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const k = t.knowledge;
  const [facts, setFacts] = useState<UserFact[]>(initial);
  const [summaries, setSummaries] = useState<ConversationMemory[]>(initialSummaries);
  const [predictions, setPredictions] = useState<Prediction[]>(initialPredictions);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Applies `change` at once and undoes it if `request` fails. */
  async function optimistic(change: () => () => void, request: () => Promise<Response>, failure: string) {
    setError(null);
    const undo = change();
    try {
      const res = await request();
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      undo();
      setError(failure);
    }
  }

  function forget(fact: UserFact) {
    return optimistic(
      () => {
        const before = facts;
        setFacts((list) => list.filter((f) => f.id !== fact.id));
        return () => setFacts(before);
      },
      () => fetch(`/api/facts/${encodeURIComponent(fact.id)}`, { method: "DELETE" }),
      k.removeError,
    );
  }

  function forgetSummary(memory: ConversationMemory) {
    return optimistic(
      () => {
        const before = summaries;
        setSummaries((list) => list.filter((m) => m.conversation_id !== memory.conversation_id));
        return () => setSummaries(before);
      },
      () => fetch(`/api/memory/summaries/${encodeURIComponent(memory.conversation_id)}`, { method: "DELETE" }),
      k.removeError,
    );
  }

  function forgetPrediction(prediction: Prediction) {
    return optimistic(
      () => {
        const before = predictions;
        setPredictions((list) => list.filter((p) => p.id !== prediction.id));
        return () => setPredictions(before);
      },
      () => fetch(`/api/memory/predictions/${encodeURIComponent(prediction.id)}`, { method: "DELETE" }),
      k.removeError,
    );
  }

  function mark(prediction: Prediction, status: PredictionStatus) {
    return optimistic(
      () => {
        const before = predictions;
        const checked_at = status === "open" ? null : new Date().toISOString();
        setPredictions((list) => list.map((p) => (p.id === prediction.id ? { ...p, status, checked_at } : p)));
        return () => setPredictions(before);
      },
      () =>
        fetch(`/api/memory/predictions/${encodeURIComponent(prediction.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        }),
      k.saveError,
    );
  }

  async function forgetAll() {
    setError(null);
    setBusy(true);
    const before = { facts, summaries, predictions };
    setFacts([]);
    setSummaries([]);
    setPredictions([]);
    try {
      const res = await fetch("/api/memory", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setConfirming(false);
    } catch {
      setFacts(before.facts);
      setSummaries(before.summaries);
      setPredictions(before.predictions);
      setError(k.forgetAllError);
    } finally {
      setBusy(false);
    }
  }

  const groups = groupFacts(facts);
  const ordered = orderPredictions(predictions);
  const today = new Date().toISOString().slice(0, 10);
  const total = facts.length + summaries.length + predictions.length;

  return (
    <section className="mt-8" aria-labelledby="knowledge-heading">
      <p className="screen-eyebrow">{k.eyebrow}</p>
      <h2 id="knowledge-heading" className="headline mt-3 text-3xl">
        {k.title}
      </h2>
      <p className="mt-2 text-sm text-muted">{k.blurb}</p>

      {predictions.length > 0 && (
        <div className="mt-4">
          <AccuracyCard card={scorecard(predictions, today)} />
        </div>
      )}

      <div className="brut-card mt-4 p-5">
        {total === 0 ? (
          <p className="text-sm text-muted">{k.empty}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.category}>
                <p className="eyebrow">{k.categories[group.category]}</p>
                <ul className="mt-2 border-t border-rule">
                  {group.facts.map((fact) => (
                    <Row key={fact.id} onForget={() => forget(fact)} label={fact.fact} forgetLabel={f(k.forget, { label: fact.fact })} forgetTitle={k.forgetThis}>
                      <span className="text-sm leading-snug">{fact.fact}</span>
                    </Row>
                  ))}
                </ul>
              </div>
            ))}

            {summaries.length > 0 && (
              <div>
                <p className="eyebrow">{k.pastConversations}</p>
                <ul className="mt-2 border-t border-rule">
                  {summaries.map((m) => (
                    <Row key={m.conversation_id} onForget={() => forgetSummary(m)} label={m.summary} forgetLabel={f(k.forget, { label: m.summary })} forgetTitle={k.forgetThis}>
                      <span className="block text-sm leading-snug">{m.summary}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {[shortDate(m.last_message_at, i18n.locale), ...m.topics.map((topic) => t.topics[topic])].filter(Boolean).join(" · ")}
                      </span>
                    </Row>
                  ))}
                </ul>
              </div>
            )}

            {ordered.length > 0 && (
              <div id="predictions" className="scroll-mt-6">
                <p className="eyebrow">{k.predictions}</p>
                <ul className="mt-2 border-t border-rule">
                  {ordered.map((p) => (
                    <Row key={p.id} onForget={() => forgetPrediction(p)} label={p.claim} forgetLabel={f(k.forget, { label: p.claim })} forgetTitle={k.forgetThis}>
                      <span className="block text-sm leading-snug">{p.claim}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>
                          {[t.topics[p.topic], windowLabel(p.window_start, p.window_end, intlLocale(i18n.locale)), k.confidence[p.confidence] ?? p.confidence].join(" · ")}
                        </span>
                        {p.status !== "open" && <span className="brut-tag">{k.status[p.status]}</span>}
                      </span>
                      {canCheck(p, today) ? (
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold">{k.didHappen}</span>
                          <button type="button" className="brut-chip" onClick={() => mark(p, "happened")}>
                            {t.common.yes}
                          </button>
                          <button type="button" className="brut-chip" onClick={() => mark(p, "didnt")}>
                            {t.common.no}
                          </button>
                          <button type="button" className="brut-chip" onClick={() => mark(p, "unsure")}>
                            {t.common.notSure}
                          </button>
                        </span>
                      ) : (
                        p.status !== "open" && (
                          <button
                            type="button"
                            className="brut-btn brut-btn-quiet mt-1 px-0 py-1 text-xs text-muted"
                            onClick={() => mark(p, "open")}
                          >
                            {t.common.undo}
                          </button>
                        )
                      )}
                    </Row>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {confirming ? (
                <>
                  <span className="text-sm font-semibold">{f(k.forgetAllConfirm, { count: total })}</span>
                  <button
                    type="button"
                    onClick={forgetAll}
                    disabled={busy}
                    className="brut-btn brut-btn-ember px-4 py-2 text-sm"
                  >
                    {k.forgetAllYes}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                    className="brut-btn brut-btn-quiet px-3 py-2 text-sm"
                  >
                    {t.common.cancel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="brut-btn brut-btn-quiet px-0 py-2 text-sm text-ember"
                >
                  {k.forgetAll}
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm font-semibold text-ember">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function Row({
  children,
  onForget,
  forgetLabel,
  forgetTitle,
}: {
  children: ReactNode;
  label: string;
  onForget: () => void;
  forgetLabel: string;
  forgetTitle: string;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-rule py-2.5">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onForget}
        className="brut-btn brut-btn-quiet -my-1 shrink-0 px-2 py-1.5 text-muted hover:text-fg"
        aria-label={forgetLabel}
        title={forgetTitle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

function shortDate(iso: string, locale: Parameters<typeof intlLocale>[0]): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", year: "numeric" });
}
