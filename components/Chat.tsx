"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMode } from "@/lib/astrology/types";

type Msg = { role: "user" | "assistant"; content: string };

const MODES: { key: ChatMode; label: string; chip: string; blurb: string }[] = [
  { key: "vedic", label: "Vedic", chip: "var(--accent)", blurb: "Sidereal chart, dashas and transits" },
  { key: "western", label: "Western", chip: "var(--violet)", blurb: "Tropical chart, Placidus houses" },
  { key: "numerology", label: "Numerology", chip: "var(--yellow)", blurb: "Your numbers from your name and birth date" },
];

// The model ends every answer with a bold "In simple words" heading followed by
// a sentence or two. That tail is lifted into a highlighted callout once the
// marker has streamed in; before that, everything renders as ordinary prose.
const SIMPLE_MARKER = /\*\*\s*in simple words\s*:?\s*\*\*/i;

function splitSimple(content: string): { main: string; simple: string | null } {
  const m = SIMPLE_MARKER.exec(content);
  if (!m) return { main: content, simple: null };
  return { main: content.slice(0, m.index), simple: content.slice(m.index) };
}

// How close to the bottom (px) still counts as "following the stream".
const NEAR_BOTTOM_PX = 80;

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
  initialTradition?: ChatMode;
  autostart?: boolean;
}) {
  const router = useRouter();
  const [tradition, setTradition] = useState<ChatMode>(initialTradition);
  const [deep, setDeep] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const convId = useRef<string | undefined>(initialConversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const countRef = useRef(messages.length);
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

  // The reader's position lives in a ref; state only changes when it flips, so
  // ordinary scrolling never re-renders the transcript.
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (near !== atBottomRef.current) {
      atBottomRef.current = near;
      setAtBottom(near);
    }
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
  }

  // Follow the stream only while the reader is already at the bottom. A new
  // turn (the message count grew) always brings the latest message into view.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const grew = messages.length > countRef.current;
    countRef.current = messages.length;
    if (!el || !(grew || atBottomRef.current)) return;
    el.scrollTop = el.scrollHeight;
    if (!atBottomRef.current) {
      atBottomRef.current = true;
      setAtBottom(true);
    }
  }, [messages]);

  const empty = messages.length === 0;
  const mode = MODES.find((m) => m.key === tradition) ?? MODES[0];

  const modeBar = (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tradition">
        {MODES.map((m) => {
          const on = tradition === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setTradition(m.key)}
              aria-pressed={on}
              className={`brut-chip${on ? " is-active" : ""}`}
              style={{ "--chip": m.chip } as CSSProperties}
            >
              {m.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDeep((d) => !d)}
          aria-pressed={deep}
          title="A bigger model and a longer answer"
          className={`brut-chip ml-auto${deep ? " is-active" : ""}`}
          style={{ "--chip": "var(--fg)" } as CSSProperties}
        >
          Deep reading
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{mode.blurb}</p>
    </div>
  );

  const composer = (
    <div className="relative mx-auto w-full max-w-2xl">
      {!empty && !atBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-3 flex justify-center">
          <button type="button" onClick={jumpToLatest} className="brut-btn brut-btn-secondary pointer-events-auto px-3 py-2 text-xs">
            Jump to latest ↓
          </button>
        </div>
      )}
      <div className="brut-bordered flex items-center gap-2 py-2 pl-4 pr-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask Astrya…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-fg outline-none placeholder:text-muted"
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send"
          className="brut-btn brut-btn-primary h-10 w-10 shrink-0 p-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {!empty && <div className="mt-3">{modeBar}</div>}
      <p className="mt-3 text-center text-[11px] text-muted">For guidance and reflection. Not a substitute for professional advice.</p>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {empty ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-8 px-4 py-8">
            <div className="animate-fade-up text-center">
              <p className="eyebrow">New reading</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
                {firstName ? `Let's read your stars, ${firstName}` : "Let's read your stars"}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted">
                Pick a tradition, then ask anything. Every answer is read from your own birth chart.
              </p>
            </div>
            <div className="w-full animate-fade-up delay-1">
              <div className="mb-3">{modeBar}</div>
              {composer}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain px-4 pt-6 pb-10">
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.map((m, i) => {
                const streaming = busy && i === messages.length - 1;
                return m.role === "user" ? (
                  <div key={i} className="flex justify-end animate-fade-up">
                    <div className="brut-card max-w-[85%] whitespace-pre-wrap break-words bg-surface-raised px-4 py-2.5 text-[15px]">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="border-l-4 border-accent pl-4 animate-fade-up">
                    <AssistantTurn content={m.content} streaming={streaming} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="px-4 pt-2" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>{composer}</div>
        </>
      )}
    </div>
  );
}

function AssistantTurn({ content, streaming }: { content: string; streaming: boolean }) {
  if (!content) return <span className="animate-shimmer text-sm text-muted">Reading your chart…</span>;
  const { main, simple } = splitSimple(content);
  const caret = <span className="caret">▍</span>;
  return (
    <div className="prose-reading max-w-none break-words text-[15px] text-fg">
      {main.trim() && <ReactMarkdown remarkPlugins={[remarkGfm]}>{main}</ReactMarkdown>}
      {streaming && simple === null && caret}
      {simple !== null && (
        <div className="callout-simple">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{simple}</ReactMarkdown>
          {streaming && caret}
        </div>
      )}
    </div>
  );
}
