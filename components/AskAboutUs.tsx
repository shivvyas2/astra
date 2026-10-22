"use client";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";

/**
 * "Ask Astrya about us": opens a match reading with both charts and asks the
 * suggested question. Follow-ups in that reading keep both charts.
 */
export function AskAboutUs({ prompt, personId }: { prompt: string; personId: string }) {
  const router = useRouter();
  const { t, f } = useI18n();
  function go() {
    router.push(`/app/chat?with=${encodeURIComponent(personId)}&ask=${encodeURIComponent(prompt)}`);
  }
  return (
    <div>
      <button type="button" onClick={go} className="brut-btn brut-btn-primary w-full py-3">
        {t.compat.ask}
      </button>
      <p className="mt-2 text-xs text-muted">{f(t.compat.askNote, { prompt })}</p>
    </div>
  );
}
