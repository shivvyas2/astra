import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";
import { resetFactsLogForTests } from "@/lib/facts/store";
import { resetMemoryLogForTests } from "@/lib/memory/store";
import { resetAnswersForTests } from "@/lib/usage/dedupe";

/**
 * The chat route's cost side: every reading's usage is recorded, nothing is
 * ever refused for volume, an identical question is answered once, and the
 * prompt keeps its cache breakpoints where they pay.
 */

const h = vi.hoisted(() => ({
  stream: vi.fn(),
  create: vi.fn(),
  afterTasks: [] as (() => Promise<unknown>)[],
  recorded: [] as unknown[],
  appended: [] as { role: string; content: string }[],
  history: [] as { role: string; content: string }[],
}));

vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => void h.afterTasks.push(task) }));
vi.mock("@/lib/usage/record", () => ({
  recordUsage: vi.fn(async (r: unknown) => void h.recorded.push(r)),
  trackUsage: vi.fn((r: unknown) => void h.recorded.push(r)),
}));
vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db } = fakeDb((call: Call) => {
      if (call.table === "birth_profiles") {
        return {
          data: {
            user_id: "u1",
            first_name: "Asha",
            last_name: "Rao",
            birth_date: "1995-03-14",
            birth_time: "06:30:00",
            lat: 23.02,
            lng: 72.57,
            timezone: "Asia/Kolkata",
            chart: { vedic: {}, western: {} },
          },
        };
      }
      return { data: [] };
    });
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } });
  }),
}));
// Consent is C's gate, tested in consent.test.ts; these tests are about cost.
vi.mock("@/lib/billing/consent", () => ({ requireConsent: async () => null }));
vi.mock("@/lib/data/birthProfile", () => ({ ensureCurrentChart: async (p: unknown) => p }));
vi.mock("@/lib/data/chat", () => ({
  getOrCreateConversation: async () => "conv-1",
  appendMessage: async (_c: string, role: string, content: string) => void h.appended.push({ role, content }),
  getMessages: async () => h.history,
}));
vi.mock("@/lib/anthropic", () => ({
  anthropic: () => ({ messages: { stream: h.stream, create: h.create } }),
  READING_MODEL: "claude-sonnet-5-5",
  DEEP_READING_MODEL: "claude-opus-5-5",
  supportsAdaptiveThinking: () => true,
  READING_EFFORT: { output_config: { effort: "medium" } },
  DEEP_EFFORT: { output_config: { effort: "high" } },
  LOW_EFFORT: { output_config: { effort: "low" } },
}));

import { POST } from "./route";

const USAGE = { input_tokens: 13, output_tokens: 538, cache_read_input_tokens: 2867, cache_creation_input_tokens: 0 };

function fakeStream(text: string, gate?: Promise<void>) {
  return {
    async *[Symbol.asyncIterator]() {
      if (gate) await gate;
      yield { type: "content_block_delta", delta: { type: "text_delta", text } };
    },
    finalMessage: async () => ({ usage: USAGE }),
  };
}

const ask = (message: string, extra: Record<string, unknown> = {}) =>
  POST(
    new Request("https://astra.shivvyas.com/api/chat", {
      method: "POST",
      body: JSON.stringify({ tradition: "numerology", message, memory: "on-device", ...extra }),
    }),
  );

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  resetFactsLogForTests();
  resetMemoryLogForTests();
  resetAnswersForTests();
  h.afterTasks = [];
  h.recorded = [];
  h.appended = [];
  h.history = [];
  h.stream.mockReset().mockImplementation(() => fakeStream("Your Mulank reads well."));
  h.create.mockReset();
  spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

const runAfter = async () => {
  for (const task of h.afterTasks) await task();
};

describe("usage recording", () => {
  it("records a standard reading's final usage once it is out", async () => {
    await (await ask("How is this year?")).text();
    await runAfter();
    expect(h.recorded).toEqual([{ userId: "u1", kind: "reading", model: "claude-sonnet-5-5", usage: USAGE, conversationId: "conv-1" }]);
  });

  it("records a Deep reading as deep_reading on the Deep model", async () => {
    await (await ask("How is this year?", { deep: true })).text();
    await runAfter();
    expect(h.recorded).toMatchObject([{ kind: "deep_reading", model: "claude-opus-5-5" }]);
  });

  it("records nothing when the model call failed before any usage came back", async () => {
    h.stream.mockImplementation(() => {
      throw new Error("overloaded");
    });
    await (await ask("How is this year?")).text();
    await runAfter();
    expect(h.recorded).toEqual([]);
  });
});

describe("no limits", () => {
  it("answers every reading, standard or Deep, however many are asked", async () => {
    for (let i = 0; i < 25; i++) {
      const res = await ask(`Question ${i}`, { deep: i % 2 === 0 });
      expect(res.status).toBe(200);
      await res.text();
    }
    expect(h.stream).toHaveBeenCalledTimes(25);
  });
});

describe("duplicate questions", () => {
  it("answers an identical question that arrives mid-stream from the first answer, with one model call", async () => {
    let open: () => void = () => {};
    const gate = new Promise<void>((r) => (open = r));
    h.stream.mockImplementation(() => fakeStream("Spring brings the change.", gate));

    const first = await ask("Will I change jobs?");
    const second = ask("Will I change jobs?");
    open();
    expect(await first.text()).toBe("Spring brings the change.");
    const dup = await second;
    expect(await dup.text()).toBe("Spring brings the change.");
    expect(dup.headers.get("x-conversation-id")).toBe("conv-1");
    expect(h.stream).toHaveBeenCalledTimes(1);
    // The question is stored once, not twice.
    expect(h.appended.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("asks the model again for a different question, or after a failed answer", async () => {
    await (await ask("Will I change jobs?")).text();
    await (await ask("Will I move house?")).text();
    expect(h.stream).toHaveBeenCalledTimes(2);

    h.stream.mockImplementationOnce(() => {
      throw new Error("overloaded");
    });
    await (await ask("Will I travel?")).text();
    await (await ask("Will I travel?")).text();
    expect(h.stream).toHaveBeenCalledTimes(4);
  });
});

describe("prompt caching", () => {
  const turns = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `turn ${i} `.padEnd(1000, ".") }));

  it("caches the chart for an hour and the conversation up to the last stored turn, with the question after it", async () => {
    h.history = turns(4);
    await (await ask("And next year?")).text();
    const req = h.stream.mock.calls[0][0];
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(req.system.slice(1).every((b: { cache_control?: unknown }) => !b.cache_control)).toBe(true);
    const marked = req.messages.map((m: { content: unknown }) =>
      Array.isArray(m.content) && m.content.some((b: { cache_control?: unknown }) => b.cache_control),
    );
    expect(marked).toEqual([false, false, false, true, false]);
    expect(req.messages.at(-1)).toEqual({ role: "user", content: "And next year?" });
  });

  it("keeps a long conversation's first resent turn the same across consecutive messages", async () => {
    const firsts: string[] = [];
    for (const n of [26, 28, 30]) {
      h.stream.mockClear();
      resetAnswersForTests();
      h.history = turns(n);
      await (await ask(`Next ${n}`)).text();
      const first = h.stream.mock.calls[0][0].messages[0].content;
      firsts.push(typeof first === "string" ? first.slice(0, 8) : first[0].text.slice(0, 8));
    }
    expect(new Set(firsts).size).toBe(1);
  });
});
