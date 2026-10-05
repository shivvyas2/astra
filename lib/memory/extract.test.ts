import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ anthropic: () => ({ messages: { create } }) }));

import { rememberTurn, buildMemoryExtractionInput, buildMemoryExtractionSystem, MEMORY_MODEL, MEMORY_SCHEMA } from "./extract";
import { parseMemoryUpdate } from "./apply";
import { resetFactsLogForTests } from "@/lib/facts/store";
import { resetMemoryLogForTests } from "./store";
import { fakeDb, type Call } from "@/lib/facts/testDb";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_FOREIGN = "99999999-9999-4999-8999-999999999999";
const TODAY = "2026-10-05";

function reply(json: unknown, stop_reason = "end_turn") {
  return {
    stop_reason,
    usage: { input_tokens: 1400, output_tokens: 150 },
    content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }],
  };
}

const MODEL_OUTPUT = {
  facts: { add: [{ fact: "Engaged since June 2026", category: "relationships", confidence: "stated" }], update: [], remove: [] },
  summary: "Asked when to marry; told the 7th lord's sub-period from Feb 2027 favours it.",
  topics: ["relationships"],
  predictions: [
    { claim: "A wedding date is fixed", topic: "relationships", window_start: "2027-02", window_end: "2027-05", confidence: "likely" },
    { claim: "Venus enters your 7th house", topic: "relationships", window_start: "2027-01", window_end: "2027-01", confidence: "likely" },
  ],
};

type Tables = Partial<Record<string, { data?: unknown; error?: unknown }>>;
function db(tables: Tables) {
  return fakeDb((call: Call) => {
    const isRead = call.ops[0]?.op === "select";
    return isRead ? (tables[call.table] ?? { data: [] }) : {};
  });
}
const missing = (t: string) => ({ error: { code: "PGRST205", message: `Could not find the table 'public.${t}' in the schema cache` } });
const base = { userId: "u1", conversationId: "c1", today: TODAY, reply: "**Marriage** Your 7th lord..." };

let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  create.mockReset();
  resetFactsLogForTests();
  resetMemoryLogForTests();
  logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => logs.forEach((s) => s.mockRestore()));

describe("the single memory call", () => {
  it("asks for facts, summary, topics and predictions in one schema", () => {
    expect(MEMORY_SCHEMA.required).toEqual(["facts", "summary", "topics", "predictions"]);
    expect(MEMORY_SCHEMA.properties.predictions.items.properties.confidence.enum).toEqual(["likely", "possible", "unlikely"]);
  });

  it("only includes the facts rules and list when the message can hold a fact", () => {
    expect(buildMemoryExtractionSystem({ today: TODAY, readFacts: true })).toContain("What counts as a fact");
    expect(buildMemoryExtractionSystem({ today: TODAY, readFacts: false })).toContain("Return three empty lists");
    const without = buildMemoryExtractionInput({ existing: [{ id: ID_A, fact: "Works", category: "work" }], readFacts: false, summary: null, message: "When does my dasha end?", reply: "In 2027." });
    expect(without).not.toContain("FACTS ON FILE");
    expect(without).toContain("THIS CONVERSATION SO FAR:\n(just started)");
    expect(without).toContain("never of facts");
  });

  it("parses the reply item by item: foreign ids, astrology facts and bare transits are dropped", () => {
    const { update, rejected } = parseMemoryUpdate(
      {
        ...MODEL_OUTPUT,
        facts: {
          add: [
            { fact: "Engaged since June 2026", category: "relationships", confidence: "stated" },
            { fact: "Has Saturn in the 7th house", category: "relationships", confidence: "stated" },
          ],
          update: [{ id: ID_FOREIGN, fact: "Married" }],
          remove: [ID_FOREIGN],
        },
      },
      { existingFactIds: new Set([ID_A]), today: TODAY },
    );
    expect(update.facts).toEqual({ add: [{ fact: "Engaged since June 2026", category: "relationships", confidence: "stated" }], update: [], remove: [] });
    expect(update.summary).toBe(MODEL_OUTPUT.summary);
    expect(update.topics).toEqual(["relationships"]);
    expect(update.predictions).toEqual([
      { claim: "A wedding date is fixed", topic: "relationships", window_start: "2027-02-01", window_end: "2027-05-31", confidence: "likely" },
    ]);
    expect(rejected).toBe(4);
  });
});

describe("rememberTurn", () => {
  it("makes no model call when none of the memory tables exist", async () => {
    const { db: d } = db({ user_facts: missing("user_facts"), conversation_memories: missing("conversation_memories"), predictions: missing("predictions") });
    expect(await rememberTurn({ ...base, db: d, message: "I got engaged in June" })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("makes one Haiku call and writes facts, the summary and predictions", async () => {
    create.mockResolvedValue(reply(MODEL_OUTPUT));
    const { db: d, calls } = db({});
    const out = await rememberTurn({ ...base, db: d, message: "I got engaged in June. When should we marry?" });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(MEMORY_MODEL);
    expect(MEMORY_MODEL).toBe("claude-haiku-4-5");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.thinking).toBeUndefined();

    expect(out?.facts?.inserts).toEqual([{ fact: "Engaged since June 2026", category: "relationships", confidence: "stated" }]);
    expect(out?.summary).toBe(true);
    expect(out?.predictions).toHaveLength(1);
    const writes = calls.filter((c) => c.ops[0].op !== "select");
    expect(writes.map((c) => `${c.table}.${c.ops[0].op}`)).toEqual([
      "user_facts.insert",
      "conversation_memories.upsert",
      "predictions.insert",
    ]);
  });

  it("still keeps the summary and predictions when the facts table is missing", async () => {
    create.mockResolvedValue(reply(MODEL_OUTPUT));
    const { db: d, calls } = db({ user_facts: missing("user_facts") });
    const out = await rememberTurn({ ...base, db: d, message: "I got engaged in June" });
    expect(out?.facts).toBeNull();
    expect(calls.filter((c) => c.ops[0].op !== "select").map((c) => c.table)).toEqual(["conversation_memories", "predictions"]);
    expect(create.mock.calls[0][0].system).toContain("Return three empty lists");
  });

  it("ignores facts the model returns for a message that cannot hold one", async () => {
    create.mockResolvedValue(reply(MODEL_OUTPUT));
    const { db: d, calls } = db({});
    await rememberTurn({ ...base, db: d, message: "When does my Saturn period end?" });
    expect(calls.some((c) => c.table === "user_facts" && c.ops[0].op === "insert")).toBe(false);
  });

  it("swallows a model failure and ignores a cut-off or non-JSON reply", async () => {
    const { db: d, calls } = db({});
    create.mockRejectedValueOnce(new Error("overloaded"));
    expect(await rememberTurn({ ...base, db: d, message: "I'm a nurse" })).toBeNull();
    create.mockResolvedValueOnce(reply('{"facts":{"add":[', "max_tokens"));
    expect(await rememberTurn({ ...base, db: d, message: "I'm a nurse" })).toBeNull();
    create.mockResolvedValueOnce(reply("not json"));
    expect(await rememberTurn({ ...base, db: d, message: "I'm a nurse" })).toBeNull();
    expect(calls.filter((c) => c.ops[0].op !== "select")).toHaveLength(0);
  });

  it("does nothing for an empty reading", async () => {
    const { db: d } = db({});
    expect(await rememberTurn({ ...base, reply: "  ", db: d, message: "I'm a nurse" })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
