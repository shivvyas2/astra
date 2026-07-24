"use client";
import { useRef, useState } from "react";
import type { Tradition } from "@/lib/astrology/types";

type Msg = { role: "user" | "assistant"; content: string };

export function Chat({
  firstName,
  initialConversationId,
}: {
  firstName?: string;
  initialConversationId?: string;
}) {
  const [tradition, setTradition] = useState<Tradition>("vedic");
  const [deep, setDeep] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const convId = useRef<string | undefined>(initialConversationId);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);

    const setLastAssistantContent = (content: string) => {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content };
        return copy;
      });
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convId.current, tradition, message: text, deep }),
      });
      convId.current = res.headers.get("x-conversation-id") ?? convId.current;

      if (!res.ok || !res.body) {
        setLastAssistantContent("Something went wrong. Please try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk };
          return copy;
        });
      }
    } catch {
      setLastAssistantContent("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  const composer = (
    <div className="w-full">
      <div className="flex items-center gap-2 rounded-[28px] border border-white/10 bg-white/[0.04] px-3 py-2 shadow-[0_8px_40px_-12px_rgba(120,110,255,0.25)] backdrop-blur-sm transition-colors focus-within:border-white/20 sm:px-4 sm:py-2.5">
        <span aria-hidden className="select-none pl-1 text-lg text-muted">✦</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask Astra…"
          className="min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-muted"
        />
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setTradition((t) => (t === "vedic" ? "western" : "vedic"))}
            title="Switch tradition"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-fg"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {tradition === "vedic" ? "Vedic" : "Western"}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="opacity-60">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setDeep((d) => !d)}
            title="Deep reading uses the more powerful model"
            className={`hidden rounded-full px-2.5 py-1.5 text-xs transition-colors sm:block ${
              deep ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-fg"
            }`}
          >
            Deep
          </button>
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="grid h-9 w-9 place-items-center rounded-full bg-fg text-bg transition-opacity disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted/70">
        For guidance and reflection. Not a substitute for professional advice.
      </p>
    </div>
  );

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-8rem)] max-w-2xl flex-col">
      {/* cosmic radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-[420px] max-w-3xl blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,91,255,0.30), rgba(232,102,61,0.07) 45%, transparent 72%)",
        }}
      />

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-1">
          <h1 className="text-center text-2xl font-light tracking-tight text-fg/90 sm:text-4xl">
            {firstName ? `Let's read your stars, ${firstName}` : "Let's read your stars"}
          </h1>
          <div className="w-full max-w-2xl">{composer}</div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-white/[0.06] px-4 py-2.5 text-[15px]">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[92%] whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg/90">
                    {m.content || <span className="text-muted">✦ reading the chart…</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="pt-2">{composer}</div>
        </>
      )}
    </div>
  );
}
