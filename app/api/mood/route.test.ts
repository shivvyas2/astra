import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  respond: (() => ({})) as (call: Call) => { data?: unknown; error?: unknown },
  calls: [] as Call[],
}));

vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db, calls } = fakeDb((call: Call) => state.respond(call));
    state.calls = calls;
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: state.user } }) } });
  }),
}));

import { POST } from "./route";

const today = new Date().toISOString().slice(0, 10);
const post = (body: unknown) => POST(new Request("http://x/api/mood", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  state.user = { id: "u1" };
  state.respond = () => ({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/mood", () => {
  it("records today's mood for the caller, one row per day", async () => {
    const res = await post({ day: today, mood: 4 });
    expect(res.status).toBe(200);
    const upsert = state.calls[0].ops.find((o) => o.op === "upsert")!;
    expect(upsert.args[0]).toMatchObject({ user_id: "u1", day: today, mood: 4 });
    expect(upsert.args[1]).toEqual({ onConflict: "user_id,day" });
  });

  it("refuses a mood outside 1 to 5, a malformed day, or a day far from today", async () => {
    expect((await post({ day: today, mood: 6 })).status).toBe(400);
    expect((await post({ day: today, mood: 2.5 })).status).toBe(400);
    expect((await post({ day: "yesterday", mood: 3 })).status).toBe(400);
    expect((await post({ day: "2020-01-01", mood: 3 })).status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it("answers 503 while the table does not exist, and 401 signed out", async () => {
    state.respond = () => ({ error: { code: "42P01", message: 'relation "mood_checkins" does not exist' } });
    expect((await post({ day: today, mood: 3 })).status).toBe(503);
    state.user = null;
    expect((await post({ day: today, mood: 3 })).status).toBe(401);
  });
});
