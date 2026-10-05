"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "Ask Astrya about us": copies the suggested question and opens a new
 * reading. The chat page has no prefill parameter yet, so the question
 * travels on the clipboard and the button says so.
 */
export function AskAboutUs({ prompt }: { prompt: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  async function go() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    router.push("/app/chat");
  }
  return (
    <div>
      <button type="button" onClick={go} className="brut-btn brut-btn-primary w-full py-3">
        Ask Astrya about us →
      </button>
      <p className="mt-2 text-xs text-muted">
        {copied ? "Question copied — paste it into the new reading." : `Opens a new reading. Suggested question: “${prompt}”`}
      </p>
    </div>
  );
}
