"use client";
import { AccuracyCard } from "@/components/AccuracyCard";
import { scorecard } from "@/lib/memory/scorecard";
import { useState, type ReactNode } from "react";
import { groupFacts, type UserFact } from "@/lib/facts/types";
import {
  TOPIC_LABEL,
  canCheck,
  orderPredictions,
  statusLabel,
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
      "Couldn't remove that. Please try again.",
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
      "Couldn't remove that. Please try again.",
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
      "Couldn't remove that. Please try again.",
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
      "Couldn't save that. Please try again.",
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
      setError("Couldn't forget everything. Please try again.");
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
      <p className="screen-eyebrow">Memory</p>
      <h2 id="knowledge-heading" className="headline mt-3 text-3xl">
        What Astrya knows
      </h2>
      <p className="mt-2 text-sm text-muted">
        What you&apos;ve told Astrya, what you talked about, and what it predicted. Readings use it to be about
        your situation and to stay consistent.
      </p>

      {predictions.length > 0 && (
        <div className="mt-4">
          <AccuracyCard card={scorecard(predictions, today)} />
        </div>
      )}

      <div className="brut-card mt-4 p-5">
        {total === 0 ? (
          <p className="text-sm text-muted">
            Tell Astrya about your life in a reading — your job, relationships, plans — and it&apos;ll remember
            here. You can delete anything.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.category}>
                <p className="eyebrow">{group.label}</p>
                <ul className="mt-2 border-t border-rule">
                  {group.facts.map((fact) => (
                    <Row key={fact.id} onForget={() => forget(fact)} label={fact.fact}>
                      <span className="text-sm leading-snug">{fact.fact}</span>
                    </Row>
                  ))}
                </ul>
              </div>
            ))}

            {summaries.length > 0 && (
              <div>
                <p className="eyebrow">Past conversations</p>
                <ul className="mt-2 border-t border-rule">
                  {summaries.map((m) => (
                    <Row key={m.conversation_id} onForget={() => forgetSummary(m)} label={m.summary}>
                      <span className="block text-sm leading-snug">{m.summary}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {[shortDate(m.last_message_at), ...m.topics.map((t) => TOPIC_LABEL[t])].filter(Boolean).join(" · ")}
                      </span>
                    </Row>
                  ))}
                </ul>
              </div>
            )}

            {ordered.length > 0 && (
              <div id="predictions" className="scroll-mt-6">
                <p className="eyebrow">Predictions</p>
                <ul className="mt-2 border-t border-rule">
                  {ordered.map((p) => (
                    <Row key={p.id} onForget={() => forgetPrediction(p)} label={p.claim}>
                      <span className="block text-sm leading-snug">{p.claim}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>
                          {[TOPIC_LABEL[p.topic], windowLabel(p.window_start, p.window_end), p.confidence].join(" · ")}
                        </span>
                        {p.status !== "open" && <span className="brut-tag">{statusLabel(p.status)}</span>}
                      </span>
                      {canCheck(p, today) ? (
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold">Did this happen?</span>
                          <button type="button" className="brut-chip" onClick={() => mark(p, "happened")}>
                            Yes
                          </button>
                          <button type="button" className="brut-chip" onClick={() => mark(p, "didnt")}>
                            No
                          </button>
                          <button type="button" className="brut-chip" onClick={() => mark(p, "unsure")}>
                            Not sure
                          </button>
                        </span>
                      ) : (
                        p.status !== "open" && (
                          <button
                            type="button"
                            className="brut-btn brut-btn-quiet mt-1 px-0 py-1 text-xs text-muted"
                            onClick={() => mark(p, "open")}
                          >
                            Undo
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
                  <span className="text-sm font-semibold">Forget all {total}? This can&apos;t be undone.</span>
                  <button
                    type="button"
                    onClick={forgetAll}
                    disabled={busy}
                    className="brut-btn brut-btn-ember px-4 py-2 text-sm"
                  >
                    Yes, forget everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                    className="brut-btn brut-btn-quiet px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="brut-btn brut-btn-quiet px-0 py-2 text-sm text-ember"
                >
                  Forget everything
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

function Row({ children, label, onForget }: { children: ReactNode; label: string; onForget: () => void }) {
  return (
    <li className="flex items-start gap-3 border-b border-rule py-2.5">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onForget}
        className="brut-btn brut-btn-quiet -my-1 shrink-0 px-2 py-1.5 text-muted hover:text-fg"
        aria-label={`Forget: ${label}`}
        title="Forget this"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
