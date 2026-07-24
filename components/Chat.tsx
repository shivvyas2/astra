"use client";
import { useRef, useState } from "react";
import type { Tradition } from "@/lib/astrology/types";

type Msg = { role: "user" | "assistant"; content: string };

export function Chat({ initialConversationId }: { initialConversationId?: string }) {
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
        setLastAssistantContent("Something went wrong — please try again.");
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
      setLastAssistantContent("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <select value={tradition} onChange={(e) => setTradition(e.target.value as Tradition)}
          className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
          <option value="vedic">Vedic (kundli)</option>
          <option value="western">Western</option>
        </select>
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> Deep reading
        </label>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-md border border-white/10 p-4">
        {messages.length === 0 && (
          <p className="text-muted">Ask about your future, a kundli reading, or advice.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === "user" ? "bg-fg text-bg" : "bg-white/5"}`}>
              {m.content || "…"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask Astra…"
          className="flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-accent" />
        <button onClick={send} disabled={busy}
          className="rounded-md bg-accent px-4 py-2 font-medium text-bg disabled:opacity-40">Send</button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        For guidance and reflection. Not a substitute for professional advice.
      </p>
    </div>
  );
}
