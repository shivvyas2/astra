import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";
import { resetAnswersForTests } from "@/lib/usage/dedupe";
import { computeChartPair } from "@/lib/data/computeForTests";
import { CARD_SEPARATOR, splitCard } from "@/lib/compat/matchCard";

/** Matching inside a reading: the tool loop in POST /api/chat. */

const ME = "11111111-1111-4111-8111-111111111111";
const KABIR = "22222222-2222-4222-8222-222222222222";
const PLACE = { name: "Nagpur, Maharashtra, India", lat: 21.15, lng: 79.09, timezone: "Asia/Kolkata", country: "India" };

const h = vi.hoisted(() => ({
  stream: vi.fn(),
  chart: {} as unknown,
  people: [] as Record<string, unknown>[],
  history: [] as { role: string; content: string }[],
  appended: [] as { role: string; content: string }[],
  attached: [] as string[],
  inserted: [] as Record<string, unknown>[],
  convPerson: null as string | null,
  usage: [] as Record<string, unknown>[],
  geocode: vi.fn(),
}));

vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => void task() }));
vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db } = fakeDb((call: Call) => {
      if (call.table === "birth_profiles") {
        return { data: { user_id: ME, first_name: "Asha", last_name: "Rao", birth_date: "1999-03-14", birth_time: "06:30:00", lat: 23.02, lng: 72.57, timezone: "Asia/Kolkata", chart: h.chart } };
      }
      if (call.table === "people") {
        const insert = call.ops.find((o) => o.op === "insert");
        if (insert) {
          const row = { id: "33333333-3333-4333-8333-333333333333", ...(insert.args[0] as object) };
          h.inserted.push(row);
          return { data: row };
        }
        const one = call.ops.find((o) => o.op === "eq" && o.args[0] === "id");
        if (one) return { data: h.people.find((p) => p.id === one.args[1]) ?? null };
        return { data: h.people };
      }
      return { data: [] };
    });
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: { id: ME } } }) } });
  }),
}));
vi.mock("@/lib/data/birthProfile", async (orig) => ({ ...(await orig<object>()), ensureCurrentChart: async (p: unknown) => p }));
vi.mock("@/lib/billing/consent", () => ({ requireConsent: async () => null }));
vi.mock("@/lib/usage/limits", () => ({ guardUsage: async () => ({ block: null, language: "english" }), limitResponse: () => new Response("") }));
vi.mock("@/lib/usage/record", async (orig) => ({ ...(await orig<object>()), recordUsage: async (u: Record<string, unknown>) => void h.usage.push(u) }));
vi.mock("@/lib/memory/extract", () => ({ rememberTurn: async () => {} }));
vi.mock("@/lib/timeline/load", () => ({ loadTimeline: async () => null }));
vi.mock("@/lib/geo", async (orig) => ({ ...(await orig<object>()), geocodePlace: h.geocode }));
vi.mock("@/lib/data/chat", () => ({
  getOrCreateConversation: async () => "conv-1",
  getConversationPerson: async () => h.convPerson,
  setConversationPerson: async (a: { personId: string }) => void h.attached.push(a.personId),
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
  finalMessage: async () => ({ usage, stop_reason: "tool_use", content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "tool_use", id: "t1", name, input }] }),
});
const script = (...turns: unknown[]) => turns.forEach((t) => h.stream.mockImplementationOnce(() => t));
const ask = async (message: string, extra: Record<string, unknown> = {}) => {
  const res = await POST(new Request("https://x/api/chat", { method: "POST", body: JSON.stringify({ tradition: "vedic", conversationId: "c", message, ...extra }) }));
  return res.text();
};
const DETAILS = { name: "Priya", relationship: "partner", birth_date: "1996-08-21", alternate_birth_date: null, birth_time: "14:10", birth_time_unknown: false, place: "Nagpur" };

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(async () => {
  h.chart = await computeChartPair();
  h.people = [{ id: KABIR, owner_id: ME, label: "Kabir", first_name: "Kabir", last_name: "", relationship: "spouse", birth_date: "1994-01-09", birth_time: "11:20:00", birth_time_known: true, place_name: "Indore", lat: 22.7, lng: 75.9, timezone: "Asia/Kolkata", chart: h.chart }];
  h.history = []; h.appended = []; h.attached = []; h.inserted = []; h.usage = []; h.convPerson = null;
  h.stream.mockReset();
  h.geocode.mockReset().mockResolvedValue([PLACE]);
  resetAnswersForTests();
  spies = [vi.spyOn(console, "log"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

const system = (n = 0) => (h.stream.mock.calls[n][0].system as { text: string }[]).map((b) => b.text).join("\n");

describe("an ordinary question", () => {
  it("is one call, with the tools on offer and the saved people listed", async () => {
    script(says("A reading."));
    expect(await ask("Will I change jobs?", { cards: true })).toBe("A reading.");
    expect(h.stream).toHaveBeenCalledTimes(1);
    expect(h.stream.mock.calls[0][0].tools.map((t: { name: string }) => t.name)).toEqual(["propose_match", "confirm_match", "use_saved_person", "look_up", "out_of_scope"]);
    expect(system()).toContain(`Kabir (spouse) [${KABIR}]`);
  });
  it("offers nothing but the way out of scope in numerology", async () => {
    script(says("Numbers."));
    await ask("My number?", { tradition: "numerology" });
    expect(h.stream.mock.calls[0][0].tools.map((t: { name: string }) => t.name)).toEqual(["out_of_scope"]);
  });
});

describe("someone's birth details", () => {
  it("come back as a card, save nothing, and cost one call", async () => {
    script(calls("propose_match", DETAILS));
    const raw = await ask("Priya, 21 Aug 1996, 2:10 PM, Nagpur", { cards: true });
    const { text, card } = splitCard(raw);
    expect(card).toMatchObject({ name: "Priya", birthDate: "1996-08-21", places: [PLACE] });
    expect(h.inserted).toEqual([]);
    expect(h.attached).toEqual([]);
    expect(h.stream).toHaveBeenCalledTimes(1);
    // The transcript keeps the words and never the card.
    expect(h.appended.at(-1)).toEqual({ role: "assistant", content: text });
  });
  it("come back as words to a client that cannot draw a card", async () => {
    script(calls("propose_match", DETAILS));
    const raw = await ask("Priya, 21 Aug 1996, 2:10 PM, Nagpur");
    expect(raw).not.toContain(CARD_SEPARATOR);
    expect(raw).toContain('Reply "yes"');
  });
});

describe("a yes", () => {
  const readBack = async () => {
    script(calls("propose_match", DETAILS));
    const text = await ask("Priya, 21 Aug 1996, 2:10 PM, Nagpur");
    h.history = [{ role: "user", content: "..." }, { role: "assistant", content: text }];
  };
  it("saves exactly what was shown, attaches it, and answers from both charts", async () => {
    await readBack();
    script(calls("confirm_match", {}), says("You score well."));
    expect(await ask("haan sahi hai")).toBe("You score well.");
    expect(h.inserted[0]).toMatchObject({ first_name: "Priya", relationship: "partner", birth_date: "1996-08-21", birth_time: "14:10", birth_time_known: true, place_name: PLACE.name });
    expect(h.attached).toEqual([h.inserted[0].id]);
    const turns = h.stream.mock.calls.at(-1)![0].messages;
    // The whole assistant turn goes back, thinking included, then its result.
    expect(turns.at(-2).content[0].type).toBe("thinking");
    expect(turns.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(turns.at(-1).content[0].content).toContain("GUNA MILAN");
    expect(h.usage.at(-1)).toMatchObject({ usage: { input_tokens: 20, output_tokens: 10 } });
  });
  it("saves nothing when nothing was read back", async () => {
    h.history = [{ role: "user", content: "hi" }, { role: "assistant", content: "**Work**\nLikely." }];
    script(calls("confirm_match", {}), says("Who do you mean?"));
    await ask("yes");
    expect(h.inserted).toEqual([]);
    expect(h.stream.mock.calls.at(-1)![0].messages.at(-1).content[0].is_error).toBe(true);
  });
  it("twice saves them once", async () => {
    await readBack();
    h.people.push({ ...h.people[0], id: "44444444-4444-4444-8444-444444444444", label: "Priya", first_name: "Priya", birth_date: "1996-08-21", birth_time: "14:10:00", place_name: PLACE.name });
    script(calls("confirm_match", {}), says("Again."));
    await ask("yes");
    expect(h.inserted).toEqual([]);
    expect(h.attached).toEqual(["44444444-4444-4444-8444-444444444444"]);
  });
});

describe("someone already saved", () => {
  it("needs no card", async () => {
    script(calls("use_saved_person", { person_id: KABIR }), says("He is steady."));
    expect(await ask("What do you think of Kabir?", { cards: true })).toBe("He is steady.");
    expect(h.attached).toEqual([KABIR]);
  });
  it("is refused when the id is not theirs", async () => {
    script(calls("use_saved_person", { person_id: "99999999-9999-4999-8999-999999999999" }), says("Who?"));
    await ask("And him?");
    expect(h.attached).toEqual([]);
  });
  it("joins an existing conversation from the card", async () => {
    script(says("Together."));
    await ask("We score 20/36", { personId: KABIR });
    expect(h.attached).toEqual([KABIR]);
    expect(system()).toContain("THE OTHER PERSON");
  });
});

describe("a reply that fails", () => {
  const breaks = () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "Half a" } };
      throw new Error("down");
    },
    finalMessage: async () => ({}),
  });
  it("is marked for Try again, and half a reading is not kept", async () => {
    script(breaks());
    const raw = await ask("Will I move?", { cards: true });
    expect(splitCard(raw)).toMatchObject({ text: "Half a", card: null, failed: true });
    expect(h.appended).toEqual([{ role: "user", content: "Will I move?" }]);
  });
  it("is a plain line to an older client", async () => {
    script(breaks());
    const raw = await ask("Will I move?");
    expect(raw).not.toContain(CARD_SEPARATOR);
    expect(raw).toContain("momentarily clouded");
  });
  it("asked again is neither stored nor sent twice", async () => {
    h.history = [{ role: "user", content: "Will I move?" }];
    script(says("Yes."));
    expect(await ask("Will I move?", { cards: true })).toBe("Yes.");
    expect(h.appended).toEqual([{ role: "assistant", content: "Yes." }]);
    expect(h.stream.mock.calls[0][0].messages).toHaveLength(1);
  });
});

it("always ends in an answer: the last round may not call a tool", async () => {
  script(...[1, 2, 3].map(() => calls("use_saved_person", { person_id: "x" })), says("Plainly, no."));
  expect(await ask("him?")).toBe("Plainly, no.");
  expect(h.stream.mock.calls[3][0].tool_choice).toEqual({ type: "none" });
});
