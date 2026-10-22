"use client";
import Link from "next/link";
import type { Scorecard } from "@/lib/memory/scorecard";
import { MIN_CHECKED_FOR_RATE } from "@/lib/memory/scorecard";
import { useI18n } from "@/lib/i18n/client";

/**
 * Astrya's record with this person: how many of its dated predictions they
 * said came true. Shown as it is, low or high — the point is that it is kept.
 * A client component because the profile's KnowledgeList draws it too.
 */
export function AccuracyCard({ card, href }: { card: Scorecard; href?: string }) {
  const { t, f } = useI18n();
  const a = t.accuracy;
  const answerLink = href && card.awaiting > 0 && (
    <Link href={href} className="brut-btn brut-btn-accent brut-btn-arrow mt-5 w-full sm:w-auto">
      {f(a.answer, { count: card.awaiting })}
    </Link>
  );

  return (
    <section className="brut-card p-5 sm:p-6" aria-labelledby="accuracy-heading">
      <div className="flex items-center justify-between gap-3">
        <p id="accuracy-heading" className="eyebrow">{a.eyebrow}</p>
        <span className="brut-tag bg-fg">{a.tag}</span>
      </div>

      {card.rate !== null ? (
        <>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-7xl font-light tabular-nums tracking-tight text-accent">{card.happened}</span>
            <span className="text-2xl font-light tabular-nums text-muted">/ {card.checked}</span>
          </p>
          <p className="text-sm text-muted">{f(a.cameTrue, { rate: card.rate })}</p>
          <div className="relative mt-4 h-1 rounded-full bg-rule" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${card.rate}%` }} />
          </div>
        </>
      ) : (
        <>
          <h3 className="headline mt-3 text-2xl">{a.emptyTitle}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {f(a.emptyBody, { min: MIN_CHECKED_FOR_RATE })}
            {card.checked > 0 && ` ${f(a.answeredSoFar, { count: card.checked })}`}
          </p>
        </>
      )}

      <dl className="mt-4">
        {card.likely.checked > 0 && (
          <Row label={a.likely} value={f(a.likelyValue, { happened: card.likely.happened, checked: card.likely.checked })} />
        )}
        <Row label={a.waiting} value={String(card.awaiting)} accent={card.awaiting > 0} />
        <Row label={a.ahead} value={String(card.upcoming)} last={card.unsure === 0} />
        {card.unsure > 0 && <Row label={a.unsure} value={String(card.unsure)} last />}
      </dl>
      {answerLink}
    </section>
  );
}

function Row({ label, value, accent, last }: { label: string; value: string; accent?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 ${last ? "" : "border-b border-rule"}`}>
      <dt className="text-[13px] font-medium text-muted">{label}</dt>
      <dd className={`text-lg font-medium tabular-nums tracking-tight ${accent ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}
