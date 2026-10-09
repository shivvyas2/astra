import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";
import { resetFactsLogForTests } from "@/lib/facts/store";
import { resetMemoryLogForTests } from "@/lib/memory/store";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  respond: (() => ({})) as (call: { table: string; ops: { op: string; args: unknown[] }[] }) => { data?: unknown; error?: unknown },
  calls: [] as { table: string; ops: { op: string; args: unknown[] }[] }[],
  afterTasks: [] as (() => Promise<unknown>)[],
  create: vi.fn(),
  consentBlock: null as Response | null,
}));

vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => state.afterTasks.push(task) }));
vi.mock("@/lib/billing/consent", () => ({ requireConsent: async () => state.consentBlock }));
vi.mock("@/lib/anthropic", () => ({ anthropic: () => ({ messages: { create: state.create } }) }));
vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db, calls } = fakeDb((call: Call) => state.respond(call));
    state.calls = calls;
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: state.user } }) } });
  }),
}));

import { GET, DELETE as DELETE_ALL } from "./route";
import { POST as INGEST } from "./ingest/route";
import { DELETE as DELETE_SUMMARY } from "./summaries/[id]/route";
import { PATCH, DELETE as DELETE_PREDICTION } from "./predictions/[id]/route";

const CONV = "33333333-3333-4333-8333-333333333333";
const OWN_FACT = "11111111-1111-4111-8111-111111111111";
const FOREIGN_FACT = "99999999-9999-4999-8999-999999999999";
const PRED = "44444444-4444-4444-8444-444444444444";

const req = (method: string, path: string, body?: unknown) =>
  new Request(`https://astra.shivvyas.com${path}`, {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const missing = (t: string) => ({ error: { code: "PGRST205", message: `Could not find the table 'public.${t}' in the schema cache` } });

/** A database that has everything: one fact, the conversation is the caller's. */
function fullDb(call: Call) {
  const op = call.ops[0]?.op;
  if (call.table === "conversations") return { data: { id: CONV } };
  if (call.table === "user_facts" && op === "select") {
    return { data: [{ id: OWN_FACT, fact: "Works as a nurse in Pune", category: "work", created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-01T00:00:00Z" }] };
  }
  if (op === "select") return { data: [] };
  return {};
}

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  state.user = { id: "u1" };
  state.respond = fullDb;
  state.afterTasks = [];
  state.create.mockReset();
  resetFactsLogForTests();
  resetMemoryLogForTests();
  spies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("auth", () => {
  it("returns 401 on every route without a user, touching no table", async () => {
    state.user = null;
    expect((await GET(req("GET", "/api/memory"))).status).toBe(401);
    expect((await DELETE_ALL(req("DELETE", "/api/memory"))).status).toBe(401);
    expect((await INGEST(req("POST", "/api/memory/ingest", { conversationId: CONV }))).status).toBe(401);
    expect((await DELETE_SUMMARY(req("DELETE", "/x"), params(CONV))).status).toBe(401);
    expect((await PATCH(req("PATCH", "/x", { status: "happened" }), params(PRED))).status).toBe(401);
    expect(state.calls).toHaveLength(0);
  });
});

describe("GET /api/memory", () => {
  it("answers empty lists, not an error, when no memory table exists yet", async () => {
    state.respond = (call) => missing(call.table);
    const res = await GET(req("GET", "/api/memory"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      facts: [],
      summaries: [],
      predictions: [],
      available: { facts: false, summaries: false, predictions: false },
    });
  });
});

describe("DELETE /api/memory", () => {
  it("forgets all three kinds, treating missing tables as already forgotten", async () => {
    state.respond = (call) => (call.table === "predictions" ? missing("predictions") : {});
    const res = await DELETE_ALL(req("DELETE", "/api/memory"));
    expect(res.status).toBe(200);
    expect(state.calls.map((c) => c.table).sort()).toEqual(["conversation_memories", "predictions", "user_facts"]);
    for (const c of state.calls) expect(c.ops).toContainEqual({ op: "eq", args: ["user_id", "u1"] });
  });
});

describe("POST /api/memory/ingest", () => {
  const payload = {
    conversationId: CONV,
    facts: {
      add: [
        { fact: "Engaged since June 2026", category: "relationships", confidence: "stated" },
        { fact: "Has Rahu in the 7th house", category: "relationships" },
      ],
      update: [
        { id: OWN_FACT, fact: "Works as a senior nurse in Pune" },
        { id: FOREIGN_FACT, fact: "Works as a pilot" },
      ],
      remove: [FOREIGN_FACT],
    },
    summary: "Asked about marriage timing; told Feb to May 2027 is likely.",
    topics: ["relationships", "fame"],
    predictions: [
      { claim: "A wedding date is fixed", topic: "relationships", window_start: "2027-02", window_end: "2027-05", confidence: "likely" },
      { claim: "Something vague", topic: "relationships", window_start: "someday", window_end: "later", confidence: "likely" },
    ],
  };

  it("writes what validates as the user, from the device, and counts what it rejected", async () => {
    const res = await INGEST(req("POST", "/api/memory/ingest", payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toEqual({ added: 1, updated: 1, removed: 0, summary: true, predictions: 1 });
    // The astrology "fact", the foreign update, the foreign remove, the undated prediction.
    expect(body.rejected).toBe(4);

    const insert = state.calls.find((c) => c.table === "user_facts" && c.ops[0].op === "insert");
    expect(insert?.ops[0].args[0]).toEqual([
      expect.objectContaining({ user_id: "u1", fact: "Engaged since June 2026", source: "on_device", source_conversation_id: CONV }),
    ]);
    const update = state.calls.find((c) => c.table === "user_facts" && c.ops[0].op === "update");
    expect(update?.ops).toContainEqual({ op: "eq", args: ["id", OWN_FACT] });
    expect(state.calls.some((c) => c.ops.some((o) => o.args.includes(FOREIGN_FACT)))).toBe(false);
    const summary = state.calls.find((c) => c.table === "conversation_memories" && c.ops[0].op === "upsert");
    expect((summary?.ops[0].args[0] as { topics: string[] }).topics).toEqual(["relationships"]);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("refuses an oversized body, bad JSON, a missing conversation id, and lists that are too long", async () => {
    expect((await INGEST(req("POST", "/api/memory/ingest", { conversationId: CONV, summary: "x".repeat(17_000) }))).status).toBe(413);
    expect((await INGEST(req("POST", "/api/memory/ingest", "{not json"))).status).toBe(400);
    expect((await INGEST(req("POST", "/api/memory/ingest", { ...payload, conversationId: "abc" }))).status).toBe(400);
    const tooMany = Array.from({ length: 11 }, () => payload.predictions[0]);
    expect((await INGEST(req("POST", "/api/memory/ingest", { ...payload, predictions: tooMany }))).status).toBe(400);
    expect((await INGEST(req("POST", "/api/memory/ingest", { ...payload, facts: [] }))).status).toBe(400);
    expect(state.calls.filter((c) => c.ops[0].op !== "select")).toHaveLength(0);
  });

  it("refuses a conversation that is not the caller's", async () => {
    state.respond = (call) => (call.table === "conversations" ? { data: null } : fullDb(call));
    const res = await INGEST(req("POST", "/api/memory/ingest", payload));
    expect(res.status).toBe(404);
    expect(state.calls.filter((c) => c.ops[0].op !== "select")).toHaveLength(0);
  });

  it("succeeds quietly, writing nothing, when the memory tables do not exist", async () => {
    state.respond = (call) => (call.table === "conversations" ? { data: { id: CONV } } : missing(call.table));
    const res = await INGEST(req("POST", "/api/memory/ingest", payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toEqual({ facts: false, summaries: false, predictions: false });
    expect(body.applied).toEqual({ added: 0, updated: 0, removed: 0, summary: false, predictions: 0 });
  });

  it("falls back to the server pass on the conversation's last exchange when asked", async () => {
    state.respond = (call) => {
      if (call.table === "messages") {
        return { data: [{ role: "assistant", content: "Likely Feb to May 2027." }, { role: "user", content: "I got engaged. When do we marry?" }] };
      }
      return fullDb(call);
    };
    state.create.mockResolvedValue({
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "text", text: JSON.stringify({ facts: { add: [], update: [], remove: [] }, summary: "Asked when to marry.", topics: [], predictions: [] }) }],
    });
    const res = await INGEST(req("POST", "/api/memory/ingest", { conversationId: CONV, fallback: "server" }));
    expect(await res.json()).toEqual({ ok: true, fallback: true });
    await state.afterTasks[0]();
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.create.mock.calls[0][0].messages[0].content).toContain("Likely Feb to May 2027.");
  });

  it("refuses the server pass, sending nothing to the model, without AI consent", async () => {
    state.respond = fullDb;
    state.consentBlock = Response.json({ error: "consent_required" }, { status: 403 });
    try {
      const res = await INGEST(req("POST", "/api/memory/ingest", { conversationId: CONV, fallback: "server" }));
      expect(res.status).toBe(403);
      expect(state.afterTasks).toHaveLength(0);
      expect(state.create).not.toHaveBeenCalled();
    } finally {
      state.consentBlock = null;
    }
  });
});

describe("summaries and predictions", () => {
  it("deletes one summary by conversation id, filtered on the caller", async () => {
    const res = await DELETE_SUMMARY(req("DELETE", "/x"), params(CONV));
    expect(res.status).toBe(200);
    expect(state.calls[0].ops).toEqual([
      { op: "delete", args: [] },
      { op: "eq", args: ["conversation_id", CONV] },
      { op: "eq", args: ["user_id", "u1"] },
    ]);
  });

  it("marks a prediction, refusing an unknown status or id", async () => {
    expect((await PATCH(req("PATCH", "/x", { status: "maybe" }), params(PRED))).status).toBe(400);
    expect((await PATCH(req("PATCH", "/x", { status: "happened" }), params("abc"))).status).toBe(400);
    const res = await PATCH(req("PATCH", "/x", { status: "happened" }), params(PRED));
    expect(res.status).toBe(200);
    expect((state.calls[0].ops[0].args[0] as { status: string }).status).toBe("happened");
  });

  it("says predictions are off when the table is missing, and deletes treat it as done", async () => {
    state.respond = () => missing("predictions");
    expect((await PATCH(req("PATCH", "/x", { status: "happened" }), params(PRED))).status).toBe(404);
    expect((await DELETE_PREDICTION(req("DELETE", "/x"), params(PRED))).status).toBe(200);
  });
});
