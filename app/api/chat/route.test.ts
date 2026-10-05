import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";
import { resetFactsLogForTests } from "@/lib/facts/store";
import { resetMemoryLogForTests } from "@/lib/memory/store";
import { resetAnswersForTests } from "@/lib/usage/dedupe";

/**
 * The chat route with the facts feature in place, against a database that
 * either has no user_facts table (production before 0008) or has facts in it.
 * The reading must stream exactly as it did before facts existed in the first
 * case, and carry the facts block in the second.
 */

const h = vi.hoisted(() => ({
  factsResult: { data: [] } as { data?: unknown; error?: unknown },
  memoriesResult: { data: [] } as { data?: unknown; error?: unknown },
  predictionsResult: { data: [] } as { data?: unknown; error?: unknown },
  stream: vi.fn(),
  create: vi.fn(),
  afterTasks: [] as (() => Promise<unknown>)[],
}));

vi.mock("next/server", () => ({
  after: (task: () => Promise<unknown>) => {
    h.afterTasks.push(task);
  },
}));

vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db } = fakeDb((call: Call) => {
      if (call.table === "user_facts") return call.ops[0]?.op === "select" ? h.factsResult : {};
      if (call.table === "conversation_memories") return call.ops[0]?.op === "select" ? h.memoriesResult : {};
      if (call.table === "predictions") return call.ops[0]?.op === "select" ? h.predictionsResult : {};
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
      return {};
    });
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } });
  }),
}));

vi.mock("@/lib/data/birthProfile", () => ({ ensureCurrentChart: async (p: unknown) => p }));
// Consent is covered by lib/billing/consent.test.ts; these tests are about the reading.
vi.mock("@/lib/billing/consent", () => ({ requireConsent: async () => null }));
vi.mock("@/lib/data/chat", () => ({
  getOrCreateConversation: async () => "conv-1",
  appendMessage: async () => {},
  getMessages: async () => [],
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

function fakeStream(text: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: "content_block_delta", delta: { type: "text_delta", text } };
    },
    finalMessage: async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }),
  };
}

const ask = (message: string, extra: Record<string, unknown> = {}) =>
  POST(
    new Request("https://astra.shivvyas.com/api/chat", {
      method: "POST",
      body: JSON.stringify({ tradition: "numerology", message, ...extra }),
    }),
  );

const MEMORY_OUTPUT = {
  facts: { add: [{ fact: "Engaged since June 2026", category: "relationships", confidence: "stated" }], update: [], remove: [] },
  summary: "Asked when to marry.",
  topics: ["relationships"],
  predictions: [],
};

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  resetFactsLogForTests();
  resetMemoryLogForTests();
  // Every test asks afresh: no answer is reused from the one before.
  resetAnswersForTests();
  h.memoriesResult = { data: [] };
  h.predictionsResult = { data: [] };
  h.afterTasks = [];
  h.stream.mockReset().mockImplementation(() => fakeStream("**Your Mulank** reads well."));
  h.create.mockReset();
  spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) =>
    s.mockImplementation(() => {}),
  );
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("POST /api/chat without any memory tables", () => {
  beforeEach(() => {
    const missing = (t: string) => ({ error: { code: "PGRST205", message: `Could not find the table 'public.${t}' in the schema cache` } });
    h.factsResult = missing("user_facts");
    h.memoriesResult = missing("conversation_memories");
    h.predictionsResult = missing("predictions");
  });

  it("streams the reading with exactly the two system blocks it always sent", async () => {
    const res = await ask("I'm a nurse in Pune. Will this year be good for my career?");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("**Your Mulank** reads well.");

    const system = h.stream.mock.calls[0][0].system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(system.map((b) => b.text).join("\n")).not.toContain("WHAT YOU KNOW ABOUT THEM");
    // And the question goes as the plain string it always was.
    const messages = h.stream.mock.calls[0][0].messages;
    expect(messages[messages.length - 1]).toEqual({ role: "user", content: "I'm a nurse in Pune. Will this year be good for my career?" });
  });

  it("schedules the memory pass after the response, which skips the model and does not throw", async () => {
    const res = await ask("I'm a nurse in Pune. Will this year be good for my career?");
    await res.text();
    expect(h.afterTasks).toHaveLength(1);
    await expect(h.afterTasks[0]()).resolves.toBeUndefined();
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat with facts", () => {
  beforeEach(() => {
    h.factsResult = {
      data: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          fact: "Works as a nurse in Pune",
          category: "work",
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-01T00:00:00Z",
        },
      ],
    };
  });

  it("adds the memory as its own block between the cached chart and the day", async () => {
    const res = await ask("Will this year be good for my career?");
    await res.text();
    const system = h.stream.mock.calls[0][0].system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(3);
    expect(system[1].text).toContain("- Work: Works as a nurse in Pune");
    expect(system[1].cache_control).toBeUndefined();
    expect(system[2].text).toContain("Today is");
  });

  it("puts what the question makes relevant on the newest message, not in the cached prefix", async () => {
    h.factsResult = {
      data: [
        { id: "11111111-1111-4111-8111-111111111111", fact: "Has a home loan of 40 lakh", category: "money", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z" },
      ],
    };
    const res = await ask("Will my finances improve?");
    await res.text();
    const messages = h.stream.mock.calls[0][0].messages;
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content[0].text).toContain("- Money: Has a home loan of 40 lakh");
    expect(last.content[1]).toEqual({ type: "text", text: "Will my finances improve?" });
    const system = h.stream.mock.calls[0][0].system as { text: string }[];
    expect(system.map((b) => b.text).join("\n")).not.toContain("home loan");
  });

  it("runs one memory pass on Haiku, with the reading, once it has finished", async () => {
    h.create.mockResolvedValue({
      stop_reason: "end_turn",
      usage: { input_tokens: 1400, output_tokens: 80 },
      content: [{ type: "text", text: JSON.stringify(MEMORY_OUTPUT) }],
    });
    const res = await ask("I got engaged in June. When should we marry?");
    await res.text();
    await h.afterTasks[0]();
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].model).toBe("claude-haiku-4-5");
    expect(h.create.mock.calls[0][0].messages[0].content).toContain("**Your Mulank** reads well.");
  });

  it("skips the Haiku pass when the iPhone is remembering this turn on-device", async () => {
    const res = await ask("I got engaged in June. When should we marry?", { memory: "on-device" });
    expect(await res.text()).toBe("**Your Mulank** reads well.");
    await h.afterTasks[0]();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("still answers when the extraction model fails", async () => {
    h.create.mockRejectedValue(new Error("overloaded"));
    const res = await ask("I got engaged in June. When should we marry?");
    expect(await res.text()).toBe("**Your Mulank** reads well.");
    await expect(h.afterTasks[0]()).resolves.toBeUndefined();
  });
});
