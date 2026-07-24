"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Tradition } from "@/lib/astrology/types";

type Msg = { role: "user" | "assistant"; content: string };

export function Chat({
  firstName,
  initialConversationId,
  initialMessages = [],
  initialTradition = "vedic",
  autostart = false,
}: {
  firstName?: string;
  initialConversationId?: string;
  initialMessages?: Msg[];
  initialTradition?: Tradition;
  autostart?: boolean;
}) {
  const router = useRouter();
  const [tradition, setTradition] = useState<Tradition>(initialTradition);
  const [deep, setDeep] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const convId = useRef<string | undefined>(initialConversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  async function send(textArg?: string, silent = false) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    if (!silent) setInput("");
    setBusy(true);
    const wasNew = !convId.current;

    setMessages((m) =>
      silent
        ? [...m, { role: "assistant", content: "" }]
        : [...m, { role: "user", content: text }, { role: "assistant", content: "" }],
    );
    const setLast = (content: string) =>
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content };
        return copy;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convId.current, tradition, message: text, deep }),
      });
      convId.current = res.headers.get("x-conversation-id") ?? convId.current;
      if (!res.ok || !res.body) return setLast("Something went wrong. Please try again.");

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
      setLast("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      if (wasNew && convId.current) router.refresh(); // update sidebar with the new reading
    }
  }

  // Auto intro reading on first login (no prior readings).
  useEffect(() => {
    if (autostart && !started.current && messages.length === 0) {
      started.current = true;
      void send("Welcome me with a short reading for today based on my chart. Two or three short sections.", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep scrolled to the latest content.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const empty = messages.length === 0;

  const composer = (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-2 rounded-[28px] border border-white/10 bg-white/[0.04] px-3 py-2 shadow-[0_8px_40px_-12px_rgba(120,110,255,0.25)] backdrop-blur-sm transition-colors focus-within:border-white/20 sm:px-4">
        <span aria-hidden className="select-none pl-1 text-lg text-muted">✦</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask Astra…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted"
        />
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setTradition((t) => (t === "vedic" ? "western" : "vedic"))} title="Switch tradition"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {tradition === "vedic" ? "Vedic" : "Western"}
          </button>
          <button type="button" onClick={() => setDeep((d) => !d)} title="Deep reading uses a more powerful model"
            className={`hidden rounded-full px-2.5 py-1.5 text-xs transition-colors sm:block ${deep ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-fg"}`}>
            Deep
          </button>
          <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send"
            className="grid h-9 w-9 place-items-center rounded-full bg-fg text-bg transition-opacity disabled:opacity-30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted/70">For guidance and reflection. Not a substitute for professional advice.</p>
    </div>
  );

  return (
    <div className="relative flex h-full flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-[420px] max-w-3xl blur-2xl animate-glow"
        style={{ background: "radial-gradient(closest-side, rgba(99,91,255,0.28), rgba(232,102,61,0.07) 45%, transparent 72%)" }} />

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
          <h1 className="animate-fade-up text-center text-2xl font-light tracking-tight text-fg/90 sm:text-4xl">
            {firstName ? `Let's read your stars, ${firstName}` : "Let's read your stars"}
          </h1>
          <div className="w-full animate-fade-up delay-1">{composer}</div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={`animate-fade-up ${m.role === "user" ? "flex justify-end" : ""}`}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-white/[0.06] px-4 py-2.5 text-[15px]">
                      {m.content}
                    </div>
                  ) : m.content ? (
                    <div className="prose-reading max-w-none break-words text-[15px] text-fg/90">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="animate-fade-in text-sm text-muted">Reading your chart…</div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 pt-2">{composer}</div>
        </>
      )}
    </div>
  );
}
