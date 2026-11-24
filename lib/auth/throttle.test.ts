import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.9, 10.0.0.1" }) }));
vi.mock("@/lib/env", () => ({ env: { supabaseServiceRoleKey: () => "secret" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({ rpc }) }));

import { entriesFor, hitInMemory, resetThrottleForTests, RULES, throttle, throttleKey } from "./throttle";

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  resetThrottleForTests();
  rpc.mockReset();
  spies = [vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("keys", () => {
  it("hold nothing about a person, and the same person is one key", () => {
    const key = throttleKey("send", "subject", "Asha@Example.com ", "secret");
    expect(key).not.toMatch(/asha|example/i);
    expect(key).toBe(throttleKey("send", "subject", "asha@example.com", "secret"));
    expect(key).not.toBe(throttleKey("verify", "subject", "asha@example.com", "secret"));
    expect(key).not.toBe(throttleKey("send", "subject", "asha@example.com", "other"));
  });
});

describe("counting", () => {
  const entries = [{ key: "k", seconds: 60, limit: 2 }];
  it("allows up to the limit, then says how long is left", () => {
    expect(hitInMemory(entries, 60_000)).toBe(0);
    expect(hitInMemory(entries, 61_000)).toBe(0);
    expect(hitInMemory(entries, 90_000)).toBe(30);
  });
  it("starts again in the next window", () => {
    for (let i = 0; i < 5; i++) hitInMemory(entries, 60_000);
    expect(hitInMemory(entries, 120_000)).toBe(0);
  });
  it("keeps people apart", () => {
    const a = entriesFor("send", "a@x.co", null, "s"), b = entriesFor("send", "b@x.co", null, "s");
    expect(hitInMemory(a)).toBe(0);
    expect(hitInMemory(a)).toBeGreaterThan(0);
    expect(hitInMemory(b)).toBe(0);
  });
});

describe("throttle", () => {
  it("asks the database, with the visitor's own address", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    expect(await throttle("send", "asha@example.com")).toBe(0);
    const args = rpc.mock.calls[0][1];
    expect(args.p_keys).toHaveLength(RULES.send.subject.length + RULES.send.visitor.length);
    expect(args.p_keys).toContain(throttleKey("send", "visitor", "203.0.113.9", "secret"));
  });
  it("passes on the wait", async () => {
    rpc.mockResolvedValue({ data: 37, error: null });
    expect(await throttle("verify", "asha@example.com")).toBe(37);
  });
  it("counts in memory before the migration, or with the database down", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } }).mockRejectedValueOnce(new Error("down"));
    expect(await throttle("send", "asha@example.com")).toBe(0);
    expect(await throttle("send", "asha@example.com")).toBeGreaterThan(0);
  });
});
