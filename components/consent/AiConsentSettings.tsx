"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONSENT_COPY, PRIVACY_PATH } from "@/lib/billing/copy";

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
      setError("Could not withdraw that. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-8" aria-labelledby="ai-consent-heading">
      <p className="eyebrow" id="ai-consent-heading">AI and your data</p>
      <div className="mt-2 border-t-2 border-fg/20">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 py-3 text-left"
        >
          <span>
            <span className="block text-[15px] font-bold">What's shared with Anthropic</span>
            <span className="mt-0.5 block text-xs text-muted">You agreed to this before your first reading.</span>
          </span>
          <span aria-hidden className="text-muted">{open ? "−" : "+"}</span>
        </button>
        {open && (
          <ul className="space-y-3 pb-4 text-sm text-muted">
            {CONSENT_COPY.sections.map((s) => (
              <li key={s.title}>
                <span className="font-bold text-fg">{s.title}. </span>
                {s.points.join(" ")}
              </li>
            ))}
            <li>
              <a href={PRIVACY_PATH} className="font-bold text-fg underline underline-offset-2">Privacy policy</a>
            </li>
          </ul>
        )}
      </div>
      <div className="border-t-2 border-fg/20 py-3">
        {confirming ? (
          <div>
            <p className="text-sm text-muted">Readings pause until you agree again. Nothing already stored is deleted by this.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={withdraw} disabled={busy} className="brut-btn brut-btn-accent px-3 py-2 text-sm">
                {busy ? "Withdrawing…" : "Withdraw consent"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="brut-btn brut-btn-quiet px-3 py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-left">
            <span className="block text-[15px] font-bold">Withdraw consent</span>
            <span className="mt-0.5 block text-xs text-muted">Stop sending your details to Anthropic.</span>
          </button>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-accent">{error}</p>}
      </div>
    </section>
  );
}
