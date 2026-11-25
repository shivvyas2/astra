import { afterEach, describe, expect, it, vi } from "vitest";
import { isListening, loadActivity } from "./audience";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
type Reply = { data?: unknown; error?: unknown };
const db = (by: Record<string, Reply>) => ({
  from: (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "gte", "order"]) q[m] = () => q;
    q.limit = async () => ({ data: [], error: null, ...by[table] });
    return q;
  },
});
afterEach(() => vi.restoreAllMocks());

describe("who is listening", () => {
  it("is anyone who opened Astrya this week, by any sign of it", async () => {
    const a = await loadActivity(db({
      user_activity: { data: [{ user_id: "opened", last_seen_at: ago(6.9) }] },
      device_tokens: { data: [{ user_id: "phone", updated_at: ago(1) }] },
      daily_readings: { data: [{ user_id: "reader", read_at: ago(2) }] },
      messages: { data: [{ created_at: ago(3), conversations: { user_id: "asker" } }] },
    }), NOW);
    for (const u of ["opened", "phone", "reader", "asker"]) expect(isListening(a, u, NOW)).toBe(true);
    expect(isListening(a, "gone", NOW)).toBe(false);
  });
  it("stops after seven days and starts again on the next visit", () => {
    const at = (days: number) => new Map([["u", NOW - days * 86_400_000]]);
    expect(isListening(at(6.99), "u", NOW)).toBe(true);
    expect(isListening(at(7), "u", NOW)).toBe(false);
    expect(isListening(at(0), "u", NOW)).toBe(true);
  });
  it("counts the newest sign", async () => {
    const a = await loadActivity(db({ birth_profiles: { data: [{ user_id: "u", updated_at: ago(6) }] }, alerts: { data: [{ user_id: "u", read_at: ago(1) }] } }), NOW);
    expect(a!.get("u")).toBe(Date.parse(ago(1)));
  });
  it("does without a table that is not there yet", async () => {
    const a = await loadActivity(db({ user_activity: { data: null, error: { code: "42P01" } }, device_tokens: { data: [{ user_id: "u", updated_at: ago(1) }] } }), NOW);
    expect(isListening(a, "u", NOW)).toBe(true);
  });
  it("pauses nobody when it cannot tell", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const a = await loadActivity(db({ messages: { data: null, error: { code: "57014", message: "timeout" } } }), NOW);
    expect(a).toBeNull();
    expect(isListening(a, "anyone", NOW)).toBe(true);
  });
});
