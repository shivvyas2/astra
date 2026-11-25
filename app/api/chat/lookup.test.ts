import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";
import { resetAnswersForTests } from "@/lib/usage/dedupe";
import { computeChartPair } from "@/lib/data/computeForTests";
import { splitCharts, type ChartBlock } from "@/lib/lookups/chartBlock";

/** Looking things up inside a reading: POST /api/chat with look_up. */

const ME = "11111111-1111-4111-8111-111111111111";
const KABIR = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => ({
  stream: vi.fn(),
  chart: {} as unknown,
  profile: {} as Record<string, unknown>,
  history: [] as { role: string; content: string; created_at?: string }[],
  appended: [] as { role: string; content: string }[],
  remembered: [] as { reply: string }[],
}));

vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => void task() }));
vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db } = fakeDb((call: Call) => {
      if (call.table === "birth_profiles") {
        return { data: { user_id: ME, first_name: "Asha", last_name: "Rao", birth_date: "1999-03-14", birth_time: "06:30:00", place_name: "Ahmedabad", lat: 23.02, lng: 72.57, timezone: "Asia/Kolkata", chart: h.chart, ...h.profile } };
      }
      if (call.table === "people") {
        const row = { id: KABIR, owner_id: ME, label: "Kabir", first_name: "Kabir", last_name: "", relationship: "spouse", birth_date: "1994-01-09", birth_time: "11:20:00", birth_time_known: true, place_name: "Indore", lat: 22.7, lng: 75.9, timezone: "Asia/Kolkata", chart: h.chart };
        return { data: call.ops.some((o) => o.op === "eq" && o.args[0] === "id") ? row : [row] };
      }
      return { data: [] };
    });
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: { id: ME } } }) } });
  }),
}));
vi.mock("@/lib/data/birthProfile", async (orig) => ({ ...(await orig<object>()), ensureCurrentChart: async (p: unknown) => p }));
vi.mock("@/lib/billing/consent", () => ({ requireConsent: async () => null }));
vi.mock("@/lib/usage/limits", () => ({ guardUsage: async () => ({ block: null, language: "english" }), limitResponse: () => new Response("") }));
vi.mock("@/lib/usage/record", async (orig) => ({ ...(await orig<object>()), recordUsage: async () => {} }));
vi.mock("@/lib/memory/extract", () => ({ rememberTurn: async (a: { reply: string }) => void h.remembered.push(a) }));
vi.mock("@/lib/timeline/load", () => ({ loadTimeline: async () => null }));
vi.mock("@/lib/geo", async (orig) => ({ ...(await orig<object>()), geocodePlace: vi.fn(async () => []) }));
vi.mock("@/lib/data/chat", () => ({
  getOrCreateConversation: async () => "conv-1",
  getConversationPerson: async () => null,
  setConversationPerson: async () => {},
  appendMessage: async (_c: string, role: string, content: string) => void h.appended.push({ role, content }),
  getMessages: async () => h.history,
}));
vi.mock("@/lib/anthropic", () => ({
  anthropic: () => ({ messages: { stream: h.stream, create: vi.fn() } }),
  READING_MODEL: "claude-sonnet-5-5",
  DEEP_READING_MODEL: "claude-opus-5-5",
  supportsAdaptiveThinking: () => true,
  READING_EFFORT: {}, DEEP_EFFORT: {}, LOW_EFFORT: {},
}));

import { POST } from "./route";

const usage = { input_tokens: 10, output_tokens: 5 };
const says = (text: string) => ({
  async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text } }; },
  finalMessage: async () => ({ usage, stop_reason: "end_turn", content: [{ type: "text", text }] }),
});
const calls = (name: string, input: unknown) => ({
  async *[Symbol.asyncIterator]() {},
  finalMessage: async () => ({ usage, stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name, input }] }),
});
const script = (...turns: unknown[]) => turns.forEach((t) => h.stream.mockImplementationOnce(() => t));
const ask = async (message: string, extra: Record<string, unknown> = {}) => {
  const res = await POST(new Request("https://x/api/chat", { method: "POST", body: JSON.stringify({ tradition: "vedic", conversationId: "c", message, ...extra }) }));
  return res.text();
};
const LOOK = { topics: ["D9"], whose: "self", draw: true, activity: null, from: null, to: null, place: null };
const system = () => (h.stream.mock.calls[0][0].system as { text: string }[]).map((b) => b.text).join("\n");
const result = (call: number) => {
  const last = (h.stream.mock.calls[call][0].messages as { content: { content: string; is_error?: boolean }[] }[]).at(-1)!;
  return last.content[0];
};

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(async () => {
  h.chart = await computeChartPair();
  h.profile = {}; h.history = []; h.appended = []; h.remembered = [];
  h.stream.mockReset();
  resetAnswersForTests();
  spies = [vi.spyOn(console, "log"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("look_up", () => {
  it("is offered to Vedic readings only", async () => {
    const tools = (n: number) => (h.stream.mock.calls[n][0].tools as { name: string }[] | undefined)?.map((t) => t.name);
    script(says("a"), says("b"), says("c"));
    await ask("q1"); await ask("q2", { tradition: "western" }); await ask("q3", { tradition: "numerology" });
    expect(tools(0)).toContain("look_up");
    expect(tools(1)).not.toContain("look_up");
    expect(tools(2)).toBeUndefined();
  });
  it("draws the chart first, then answers from it, and stores both", async () => {
    script(calls("look_up", LOOK), says("**Love**\nMost likely yes."));
    const text = await ask("D9 dekh kr btao");
    const [chart, words] = splitCharts(text) as [ChartBlock, string];
    expect(chart.id).toBe("D9");
    expect(words.trim()).toBe("**Love**\nMost likely yes.");
    expect(result(1).content).toContain("Asha's D9");
    expect(h.appended.at(-1)).toEqual({ role: "assistant", content: text });
    await vi.waitFor(() => expect(h.remembered).toHaveLength(1));
    expect(h.remembered[0].reply).not.toContain("Taurus:");
  });
  it("sends earlier drawings back as a note, so they are not copied", async () => {
    script(calls("look_up", LOOK), says("One."));
    const first = await ask("draw my D9");
    h.history = [{ role: "user", content: "draw my D9" }, { role: "assistant", content: first }];
    script(says("Two."));
    await ask("and then?");
    const sent = JSON.stringify(h.stream.mock.calls[2][0].messages);
    expect(sent).toContain("[The app drew Asha's D9 chart here.]");
    expect(sent).not.toContain("**Chart D9");
  });
  it("reads a match's chart once they have joined", async () => {
    script(calls("use_saved_person", { person_id: KABIR }), calls("look_up", { ...LOOK, whose: "both", draw: false }), says("Both."));
    expect(await ask("Compare our D9s")).toBe("Both.");
    expect(result(2).content).toContain("Kabir's D9");
  });
  it("tells the model when nobody else is there, or the call is malformed", async () => {
    script(calls("look_up", { ...LOOK, whose: "other" }), calls("look_up", { topics: [] }), says("Sorry."));
    expect(await ask("His D9?")).toBe("Sorry.");
    expect(result(1).is_error).toBe(true);
    expect(result(2).is_error).toBe(true);
  });
  it("is not a reading by itself: a drawing with no words can be tried again", async () => {
    script(calls("look_up", LOOK), says(""));
    expect(await ask("D9", { cards: true })).toContain("failed");
    expect(h.appended.some((m) => m.role === "assistant")).toBe(false);
  });
  it("stops calling tools after the last round", async () => {
    script(calls("look_up", LOOK), calls("look_up", LOOK), calls("look_up", LOOK), says("Done."));
    await ask("everything");
    expect(h.stream).toHaveBeenCalledTimes(4);
    expect(h.stream.mock.calls[3][0].tool_choice).toEqual({ type: "none" });
  });
});

describe("birth details that changed or cannot be right", () => {
  it("says so when the profile was saved again after an earlier reply", async () => {
    h.profile = { updated_at: "2026-11-11T17:35:00Z" };
    h.history = [{ role: "user", content: "q", created_at: "2026-11-11T17:15:00Z" }, { role: "assistant", content: "a", created_at: "2026-11-11T17:15:30Z" }];
    script(says("x"));
    await ask("next");
    expect(system()).toContain("birth details changed");
  });
  it("says nothing when it was not", async () => {
    h.profile = { updated_at: "2026-11-01T00:00:00Z" };
    h.history = [{ role: "user", content: "q", created_at: "2026-11-11T17:15:00Z" }, { role: "assistant", content: "a", created_at: "2026-11-11T17:15:30Z" }];
    script(says("x"));
    await ask("next");
    expect(system()).not.toContain("birth details changed");
  });
  it("asks for the year to be corrected when it makes them an infant", async () => {
    h.profile = { birth_date: `${new Date().getUTCFullYear()}-01-02` };
    script(says("x"));
    await ask("When will I marry?");
    expect(system()).toContain("almost certainly a slip");
  });
});
