import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryDb } from "@/lib/admin/testDb";
import { checkUsageLimits, effectiveLimits, limitMessage, limitResponse } from "./limits";
import { parseLimit } from "@/lib/admin/limits";

const USER = "u1";
const NOW = new Date("2026-10-26T18:00:00Z");

type Row = Record<string, unknown>;

/** memoryDb plus model_cost_since, summed from the model_usage rows like the SQL function. */
function db(tables: Record<string, Row[]>, opts: { missing?: string[]; rpcFails?: boolean } = {}) {
  const base = memoryDb({ tables, missing: opts.missing });
  return {
    from: (t: string) => base.from(t),
    rpc: async (_fn: string, args: { since: string; uid: string | null }) => {
      if (opts.rpcFails) return { data: null, error: { message: "boom" } };
      const rows = (tables.model_usage ?? []).filter(
        (r) => String(r.created_at) >= args.since && (args.uid === null || r.user_id === args.uid),
      );
      return { data: rows.reduce((s, r) => s + Number(r.cost_usd), 0), error: null };
    },
  };
}

const limits = (l: Partial<{ readings_per_day: number | null; usd_per_user_day: number | null; usd_all_users_day: number | null }>) => [
  { id: true, readings_per_day: null, usd_per_user_day: null, usd_all_users_day: null, ...l },
];
const reading = (user: string, at: string, cost = 0.02, kind = "reading") => ({ user_id: user, kind, cost_usd: cost, created_at: at });
const profile = { user_id: USER, timezone: "UTC", reading_language: "english" };

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("checkUsageLimits", () => {
  it("allows everything before migration 0018", async () => {
    const d = db({ birth_profiles: [profile] }, { missing: ["usage_limits", "user_usage_limits"] });
    expect((await checkUsageLimits(d, USER, { reading: true, now: NOW })).block).toBeNull();
  });

  it("refuses the reading after the daily count, counting only today", async () => {
    const d = db({
      usage_limits: limits({ readings_per_day: 2 }),
      birth_profiles: [profile],
      model_usage: [reading(USER, "2026-10-25T23:00:00Z"), reading(USER, "2026-10-26T01:00:00Z"), reading(USER, "2026-10-26T02:00:00Z", 0.05, "deep_reading")],
    });
    const r = await checkUsageLimits(d, USER, { reading: true, now: NOW });
    expect(r.block).toEqual({ reason: "readings", resetAt: "2026-10-27T00:00:00.000Z" });
    // The timeline routes do not count readings.
    expect((await checkUsageLimits(d, USER, { reading: false, now: NOW })).block).toBeNull();
  });

  it("uses the user's own day", async () => {
    // NOW is 23:30 on the 26th in Kolkata. 19:00Z on the 25th is 00:30 on the
    // 26th there: today for them, though yesterday in UTC.
    const d = db({
      usage_limits: limits({ readings_per_day: 1 }),
      birth_profiles: [{ ...profile, timezone: "Asia/Kolkata" }],
      model_usage: [reading(USER, "2026-10-25T19:00:00Z")],
    });
    const r = await checkUsageLimits(d, USER, { reading: true, now: NOW });
    expect(r.block).toEqual({ reason: "readings", resetAt: "2026-10-26T18:30:00.000Z" });
  });

  it("a user override replaces the default", async () => {
    const d = db({
      usage_limits: limits({ readings_per_day: 1 }),
      user_usage_limits: [{ user_id: USER, readings_per_day: 5, usd_per_user_day: null }],
      birth_profiles: [profile],
      model_usage: [reading(USER, "2026-10-26T01:00:00Z"), reading(USER, "2026-10-26T02:00:00Z")],
    });
    expect((await checkUsageLimits(d, USER, { reading: true, now: NOW })).block).toBeNull();
  });

  it("refuses on the user's spend, for timeline calls too", async () => {
    const d = db({
      usage_limits: limits({ usd_per_user_day: 0.1 }),
      birth_profiles: [profile],
      model_usage: [reading(USER, "2026-10-26T01:00:00Z", 0.06), { user_id: USER, kind: "extraction", cost_usd: 0.05, created_at: "2026-10-26T03:00:00Z" }],
    });
    expect((await checkUsageLimits(d, USER, { reading: false, now: NOW })).block?.reason).toBe("user_spend");
  });

  it("pauses everyone when the all-users spend is reached, until midnight UTC", async () => {
    const d = db({
      usage_limits: limits({ usd_all_users_day: 1 }),
      birth_profiles: [profile],
      model_usage: [reading("someone-else", "2026-10-26T05:00:00Z", 1.2)],
    });
    expect((await checkUsageLimits(d, USER, { reading: true, now: NOW })).block).toEqual({
      reason: "all_spend",
      resetAt: "2026-10-27T00:00:00.000Z",
    });
  });

  it("never limits an admin", async () => {
    const d = db({
      usage_limits: limits({ readings_per_day: 0, usd_all_users_day: 0 }),
      admins: [{ user_id: USER }],
      birth_profiles: [profile],
    });
    expect((await checkUsageLimits(d, USER, { reading: true, now: NOW })).block).toBeNull();
  });

  it("allows the call when the spend lookup fails", async () => {
    const d = db({ usage_limits: limits({ usd_all_users_day: 0 }), birth_profiles: [profile] }, { rpcFails: true });
    expect((await checkUsageLimits(d, USER, { reading: true, now: NOW })).block).toBeNull();
  });
});

describe("effectiveLimits", () => {
  it("falls back field by field and keeps the all-users limit", () => {
    expect(
      effectiveLimits({ readingsPerDay: 25, usdPerUserDay: 1, usdAllUsersDay: 10 }, { readingsPerDay: 0, usdPerUserDay: null }),
    ).toEqual({ readingsPerDay: 0, usdPerUserDay: 1, usdAllUsersDay: 10 });
  });
});

describe("the refusal", () => {
  it("is a plain-text 429 in the reader's language", async () => {
    const res = limitResponse({ reason: "readings", resetAt: "2026-10-27T00:00:00.000Z" }, "hindi");
    expect(res.status).toBe(429);
    expect(res.headers.get("x-limit-reason")).toBe("readings");
    expect(await res.text()).toContain("Astrya");
    expect(limitMessage({ reason: "all_spend", resetAt: "" }, "english")).toMatch(/paused/);
    expect(limitMessage({ reason: "readings", resetAt: "" }, "klingon")).toMatch(/today's readings/);
  });
});

describe("parseLimit", () => {
  it("reads blank as no limit and rejects nonsense", () => {
    expect(parseLimit("", "readings")).toBeNull();
    expect(parseLimit(null, "usd")).toBeNull();
    expect(parseLimit("25", "readings")).toBe(25);
    expect(parseLimit(0, "readings")).toBe(0);
    expect(parseLimit("$1.234", "usd")).toBe(1.23);
    expect(parseLimit("2.5", "readings")).toBeUndefined();
    expect(parseLimit("-1", "usd")).toBeUndefined();
    expect(parseLimit("abc", "usd")).toBeUndefined();
  });
});
