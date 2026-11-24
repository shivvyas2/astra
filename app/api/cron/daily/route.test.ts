import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ p: {} as object, a: {} as object, d: {} as object, ai: null as unknown }));
vi.mock("@/lib/env", () => ({ env: { cronSecret: () => "s" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));
vi.mock("@/lib/alerts/predictions", () => ({ runDuePredictions: async () => h.p }));
vi.mock("@/lib/alerts/run", () => ({ runDailyAlerts: async () => h.a }));
vi.mock("@/lib/alerts/discoveries", () => ({ runDiscoveries: async () => h.d }));
vi.mock("@/lib/health/ai", async (orig) => ({ ...(await orig<object>()), loadAiHealth: async () => h.ai }));

import { GET } from "./route";

const run = () => GET(new Request("https://x", { headers: { authorization: "Bearer s" } }));
beforeEach(() => {
  h.p = { written: 0, aiFailures: 0 };
  h.a = { alerted: 0, aiFailures: 0 };
  h.d = { written: 0, aiFailures: 0 };
  h.ai = { down: false, lastSuccessAt: null, unanswered: 0 };
});

describe("the daily job as an alarm", () => {
  it("passes when nothing was due", async () => expect((await run()).status).toBe(200));
  it("passes when the health cannot be read", async () => {
    h.ai = null;
    expect((await run()).status).toBe(200);
  });
  it("fails on one refused key", async () => {
    h.p = { written: 0, aiFailures: 1, aiReason: "401 authentication_error" };
    expect((await run()).status).toBe(503);
  });
  it("shrugs off one odd reply, and not three", async () => {
    h.p = { written: 0, aiFailures: 1, aiReason: "unparseable reply" };
    expect((await run()).status).toBe(200);
    h.p = { written: 0, aiFailures: 3, aiReason: "529 overloaded_error" };
    expect((await run()).status).toBe(503);
  });
  it("fails when people are waiting on answers, unless something worked", async () => {
    h.ai = { down: true, lastSuccessAt: null, unanswered: 4 };
    expect((await run()).status).toBe(503);
    h.p = { written: 1, aiFailures: 0 };
    expect((await run()).status).toBe(200);
  });
  it("still refuses a stranger", async () => expect((await GET(new Request("https://x"))).status).toBe(401));
});
