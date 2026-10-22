"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRIVACY_PATH } from "@/lib/billing/copy";
import { useI18n } from "@/lib/i18n/client";

/**
 * Profile entry for AI consent: what was agreed, a way to re-read it, and a
 * way to withdraw it. Withdrawing deletes the server record (DELETE
 * /api/consent); the signed-in layout then shows the consent screen again
 * before any further reading.
 *
 * Place on app/(app)/app/profile/page.tsx, e.g. under <KnowledgeList … />.
 */
export function AiConsentSettings() {
  const router = useRouter();
  const { t } = useI18n();
  const c = t.consent;
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consent", { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(c.withdrawError);
      setBusy(false);
    }
  }

  return (
    <section className="mt-8" aria-labelledby="ai-consent-heading">
      <p className="screen-eyebrow" id="ai-consent-heading">{c.settingsEyebrow}</p>
      <div className="mt-2 border-t border-rule">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 py-3 text-left"
        >
          <span>
            <span className="block text-[15px] font-semibold">{c.shared}</span>
            <span className="mt-0.5 block text-xs text-muted">{c.agreedBefore}</span>
          </span>
          <span aria-hidden className="text-muted">{open ? "−" : "+"}</span>
        </button>
        {open && (
          <ul className="space-y-3 pb-4 text-sm text-muted">
            {c.sections.map((s) => (
              <li key={s.title}>
                <span className="font-semibold text-fg">{s.title}. </span>
                {s.points.join(" ")}
              </li>
            ))}
            <li>
              <a href={PRIVACY_PATH} className="font-semibold text-fg underline underline-offset-2">{t.common.privacyPolicy}</a>
            </li>
          </ul>
        )}
      </div>
      <div className="border-t border-rule py-3">
        {confirming ? (
          <div>
            <p className="text-sm text-muted">{c.withdrawNote}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={withdraw} disabled={busy} className="brut-btn brut-btn-ember px-4 py-2 text-sm">
                {busy ? c.withdrawing : c.withdraw}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="brut-btn brut-btn-quiet px-3 py-2 text-sm">
                {t.common.cancel}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-left">
            <span className="block text-[15px] font-semibold">{c.withdraw}</span>
            <span className="mt-0.5 block text-xs text-muted">{c.withdrawHint}</span>
          </button>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-ember">{error}</p>}
      </div>
    </section>
  );
}
