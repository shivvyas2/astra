"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import { PRIVACY_PATH } from "@/lib/billing/copy";
import { useI18n } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";

/**
 * The AI consent screen, shown by the signed-in layout in place of the app
 * until the user agrees to the current notice. "Not now" is never a dead end:
 * it explains why readings need this and offers to review it again (or sign
 * out). Agreement is recorded by POST /api/consent, then the layout re-renders.
 */
export function AiConsentGate({ version }: { version: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const CONSENT_COPY = t.consent;
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version, platform: "web" }),
      });
      if (res.status === 409) {
        // The notice changed while this page was open: show the new one.
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(CONSENT_COPY.saveError);
      setBusy(false);
    }
  }

  return (
    <div className="atmosphere atmosphere-dusk min-h-dvh overflow-y-auto text-fg">
      <main className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-8 pt-10 sm:px-6 sm:pt-16">
        {declined ? (
          <Declined onReview={() => setDeclined(false)} />
        ) : (
          <>
            <header className="animate-fade-up">
              <div className="flex items-center">
                <p className="screen-eyebrow">{CONSENT_COPY.eyebrow}</p>
              </div>
              <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{CONSENT_COPY.title}</h1>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">{CONSENT_COPY.intro}</p>
            </header>

            <section className="mt-8 animate-fade-up delay-1" aria-label={CONSENT_COPY.sectionsAria}>
              {CONSENT_COPY.sections.map((s) => (
                <div key={s.title} className="grid grid-cols-[4.5rem_1fr] gap-4 border-t border-rule py-5 sm:grid-cols-[6rem_1fr]">
                  <p className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-accent">{s.label}</p>
                  <div>
                    <h2 className="text-base font-semibold">{s.title}</h2>
                    <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
                      {s.points.map((p) => (
                        <li key={p} className="flex gap-2">
                          <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-fg/50" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
              <p className="border-t border-rule pt-4 text-xs text-muted">
                {rich(CONSENT_COPY.fullDetails, {
                  privacy: (s) => (
                    <a href={PRIVACY_PATH} target="_blank" rel="noreferrer" className="font-semibold text-fg underline underline-offset-2">
                      {s}
                    </a>
                  ),
                })}
              </p>
            </section>

            <div
              className="sticky bottom-0 -mx-4 mt-8 bg-bg/90 px-4 pt-4 backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {error && (
                <p role="alert" className="mb-3 rounded-[14px] border border-ember/55 bg-ember/10 px-3.5 py-3 text-sm font-medium">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row-reverse">
                <button type="button" onClick={agree} disabled={busy} className="brut-btn brut-btn-primary brut-btn-arrow min-h-[54px] flex-1 px-5">
                  {busy ? t.common.saving : CONSENT_COPY.agree}
                </button>
                <button
                  type="button"
                  onClick={() => setDeclined(true)}
                  disabled={busy}
                  className="brut-btn brut-btn-secondary min-h-[54px] flex-1 px-5"
                >
                  {CONSENT_COPY.notNow}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Declined({ onReview }: { onReview: () => void }) {
  const { t } = useI18n();
  const CONSENT_COPY = t.consent;
  return (
    <div className="my-auto animate-fade-up">
      <p className="screen-eyebrow">{CONSENT_COPY.nothingSent}</p>
      <h1 className="headline mt-3 text-4xl sm:text-5xl">{CONSENT_COPY.declinedTitle}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">{CONSENT_COPY.declinedBody}</p>
      <div className="mt-8 flex flex-col gap-3">
        <button type="button" onClick={onReview} className="brut-btn brut-btn-primary brut-btn-arrow min-h-[54px] px-5">
          {CONSENT_COPY.reviewAgain}
        </button>
        <form action={signOut}>
          <button type="submit" className="brut-btn brut-btn-quiet w-full px-5 py-3 text-sm">
            {t.common.signOut}
          </button>
        </form>
      </div>
    </div>
  );
}
