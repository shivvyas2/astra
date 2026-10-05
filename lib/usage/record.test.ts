import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { costUsd, priceFor, MODEL_PRICES } from "./prices";
import { recordUsage, resetUsageLogForTests, tokenCounts, usageRow } from "./record";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetUsageLogForTests();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("prices", () => {
  it("knows every model the app calls, at list price", () => {
    expect(MODEL_PRICES["claude-sonnet-5-5"]).toEqual({ input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 });
    expect(MODEL_PRICES["claude-opus-5-5"]).toMatchObject({ input: 4, output: 20, cacheRead: 0.2 });
    expect(MODEL_PRICES["claude-haiku-4-5"]).toMatchObject({ input: 1, output: 5, cacheRead: 0.1 });
  });

  it("tolerates a dated suffix and returns null for an unknown model", () => {
    expect(priceFor("claude-haiku-4-5-20251001")).toBe(MODEL_PRICES["claude-haiku-4-5"]);
    expect(priceFor("gpt-9")).toBeNull();
    expect(costUsd("gpt-9", { input: 1e6, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 })).toBe(0);
  });

  it("prices a mid-conversation Sonnet reading", () => {
    // 13 fresh input, 2,867 cache read, 538 output (docs/MODEL_COSTS.md).
    const usd = costUsd("claude-sonnet-5-5", { input: 13, output: 538, cacheRead: 2867, cacheWrite5m: 0, cacheWrite1h: 0 });
    expect(usd).toBeCloseTo((13 * 2 + 538 * 10 + 2867 * 0.2) / 1e6, 6);
  });
});

describe("tokenCounts", () => {
  it("splits cache writes by TTL when the breakdown is present", () => {
    expect(
      tokenCounts({
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 300,
        cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
      }),
    ).toEqual({ input: 10, output: 20, cacheRead: 30, cacheWrite5m: 100, cacheWrite1h: 200 });
  });

  it("bills writes at the 5-minute rate without a breakdown, and treats nulls as zero", () => {
    expect(tokenCounts({ input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 50, cache_read_input_tokens: null })).toEqual({
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite5m: 50,
      cacheWrite1h: 0,
    });
    expect(tokenCounts(undefined)).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 });
  });
});

describe("recordUsage", () => {
  const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 };

  it("inserts one row with the computed cost", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    await recordUsage({ userId: "u1", kind: "reading", model: "claude-sonnet-5-5", usage, conversationId: "c1" }, { from: () => ({ insert }) });
    expect(insert).toHaveBeenCalledWith({
      user_id: "u1",
      kind: "reading",
      model: "claude-sonnet-5-5",
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_tokens: 2000,
      cache_write_tokens: 0,
      cost_usd: 0.0074,
      conversation_id: "c1",
    });
  });

  it("warns once and carries on when the table is missing", async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: "PGRST205", message: "Could not find the table" } }) }) };
    await recordUsage({ kind: "memory", model: "claude-haiku-4-5", usage }, db);
    await recordUsage({ kind: "memory", model: "claude-haiku-4-5", usage }, db);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("0010");
  });

  it("never throws, even when the client does", async () => {
    const db = {
      from: () => {
        throw new Error("boom");
      },
    };
    await expect(recordUsage({ kind: "daily", model: "claude-sonnet-5-5" }, db)).resolves.toBeUndefined();
    // And without any client configured at all (no env in tests).
    await expect(recordUsage({ kind: "daily", model: "claude-sonnet-5-5" })).resolves.toBeUndefined();
  });

  it("records a null user for jobs that have none", () => {
    expect(usageRow({ kind: "alert", model: "claude-opus-5-5" })).toMatchObject({ user_id: null, conversation_id: null, cost_usd: 0 });
  });
});
