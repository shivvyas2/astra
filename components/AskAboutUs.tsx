"use client";
import { useRouter } from "next/navigation";

/**
 * "Ask Astrya about us": opens a match reading with both charts and asks the
 * suggested question. Follow-ups in that reading keep both charts.
 */
export function AskAboutUs({ prompt, personId }: { prompt: string; personId: string }) {
  const router = useRouter();
  function go() {
    router.push(`/app/chat?with=${encodeURIComponent(personId)}&ask=${encodeURIComponent(prompt)}`);
  }
  return (
    <div>
      <button type="button" onClick={go} className="brut-btn brut-btn-primary w-full py-3">
        Ask Astrya about us →
      </button>
      <p className="mt-2 text-xs text-muted">
        {`Opens a reading with both charts and asks: “${prompt}” Follow-up questions keep both charts.`}
      </p>
    </div>
  );
}
