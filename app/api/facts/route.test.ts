import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";
import { resetFactsLogForTests } from "@/lib/facts/store";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  respond: (() => ({})) as (call: { table: string; ops: { op: string; args: unknown[] }[] }) => {
    data?: unknown;
    error?: unknown;
  },
  calls: [] as { table: string; ops: { op: string; args: unknown[] }[] }[],
}));

vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db, calls } = fakeDb((call: Call) => state.respond(call));
    state.calls = calls;
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: state.user } }) } });
  }),
}));

import { GET, DELETE as DELETE_ALL } from "./route";
import { DELETE as DELETE_ONE } from "./[id]/route";

const ID = "11111111-1111-4111-8111-111111111111";
const req = (method: string, path = "/api/facts") => new Request(`https://astra.shivvyas.com${path}`, { method });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  state.user = { id: "u1" };
  state.respond = () => ({});
  resetFactsLogForTests();
  spies = [vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("auth", () => {
  it("returns 401 on every route without a user, touching no table", async () => {
    state.user = null;
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await DELETE_ALL(req("DELETE"))).status).toBe(401);
    expect((await DELETE_ONE(req("DELETE", `/api/facts/${ID}`), params(ID))).status).toBe(401);
    expect(state.calls).toHaveLength(0);
  });
});

describe("GET /api/facts", () => {
  it("lists the caller's facts", async () => {
    const row = { id: ID, fact: "Works as a nurse in Pune", category: "work", created_at: "x", updated_at: "y" };
    state.respond = () => ({ data: [row] });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ facts: [row], available: true });
  });

  it("answers an empty list, not an error, when the table does not exist yet", async () => {
    state.respond = () => ({ error: { code: "PGRST205", message: "Could not find the table 'public.user_facts'" } });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ facts: [], available: false });
  });
});

describe("DELETE /api/facts/[id]", () => {
  it("rejects an id that is not a uuid", async () => {
    const res = await DELETE_ONE(req("DELETE", "/api/facts/abc"), params("abc"));
    expect(res.status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it("deletes one fact, filtered on id and the caller", async () => {
    const res = await DELETE_ONE(req("DELETE", `/api/facts/${ID}`), params(ID));
    expect(res.status).toBe(200);
    expect(state.calls[0].table).toBe("user_facts");
    expect(state.calls[0].ops).toEqual([
      { op: "delete", args: [] },
      { op: "eq", args: ["id", ID] },
      { op: "eq", args: ["user_id", "u1"] },
    ]);
  });

  it("reports a real failure as a 500 with an error message", async () => {
    state.respond = () => ({ error: { code: "08006", message: "connection failure" } });
    const res = await DELETE_ONE(req("DELETE", `/api/facts/${ID}`), params(ID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not remove that." });
  });
});

describe("DELETE /api/facts", () => {
  it("forgets everything the caller has", async () => {
    const res = await DELETE_ALL(req("DELETE"));
    expect(res.status).toBe(200);
    expect(state.calls[0].ops).toEqual([
      { op: "delete", args: [] },
      { op: "eq", args: ["user_id", "u1"] },
    ]);
  });

  it("succeeds when the table is missing: there is nothing to forget", async () => {
    state.respond = () => ({ error: { code: "42P01", message: "relation does not exist" } });
    const res = await DELETE_ALL(req("DELETE"));
    expect(res.status).toBe(200);
  });
});
