import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryDb } from "@/lib/admin/testDb";
import { resetTodayLogForTests } from "@/lib/usage/today";

/** GET /api/usage: the caller's own counts. Informational only; there are no limits to report. */

const h = vi.hoisted(() => ({ user: null as null | { id: string }, timezone: "UTC" as string | null, db: null as unknown }));

vi.mock("@/lib/supabase/route", () => ({
  bearerTokenFrom: () => null,
  createRouteSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: h.timezone ? { timezone: h.timezone } : null }) }) }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => h.db }));

import { GET } from "./route";

const today = new Date().toISOString();
const usageRows = [
  { user_id: "u1", kind: "reading", cost_usd: 0.01, created_at: today },
  { user_id: "u1", kind: "deep_reading", cost_usd: 0.05, created_at: today },
  { user_id: "u1", kind: "memory", cost_usd: 0.002, created_at: today },
  { user_id: "u2", kind: "reading", cost_usd: 0.01, created_at: today },
];
const call = () => GET(new Request("https://astra.shivvyas.com/api/usage"));

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  resetTodayLogForTests();
  h.user = { id: "u1" };
  h.timezone = "UTC";
  h.db = memoryDb({ tables: { model_usage: usageRows } });
  spies = [vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("GET /api/usage", () => {
  it("is 401 signed out", async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
  });

  it("reports today's readings and Deep readings, unlimited, with no cost for a non-admin", async () => {
    const body = await (await call()).json();
    expect(body).toEqual({ plan: "free", unlimited: true, today: { readings: 2, deep: 1 }, resetAt: expect.any(String) });
    expect(new Date(body.resetAt).getTime()).toBeGreaterThan(Date.now());
    expect(body).not.toHaveProperty("limits");
  });

  it("adds this month's model spend for an admin", async () => {
    h.db = memoryDb({ tables: { model_usage: usageRows, admins: [{ user_id: "u1" }] } });
    const body = await (await call()).json();
    expect(body.monthCostUsd).toBeCloseTo(0.062, 6);
  });

  it("counts assistant messages when model_usage is missing", async () => {
    h.db = memoryDb({
      missing: ["model_usage"],
      tables: {
        conversations: [{ id: "c1", user_id: "u1" }],
        messages: [
          { id: "m1", conversation_id: "c1", role: "assistant", created_at: today },
          { id: "m2", conversation_id: "c1", role: "user", created_at: today },
          { id: "m3", conversation_id: "c1", role: "assistant", created_at: "2020-01-01T00:00:00.000Z" },
        ],
      },
    });
    expect((await (await call()).json()).today).toEqual({ readings: 1, deep: 0 });
  });

  it("is zeros, not an error, when nothing can be read", async () => {
    h.db = memoryDb({ missing: ["model_usage", "conversations", "messages", "admins"] });
    h.timezone = null;
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).today).toEqual({ readings: 0, deep: 0 });
  });
});
