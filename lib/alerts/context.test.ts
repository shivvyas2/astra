import { describe, expect, it } from "vitest";
import { computeChartPair } from "@/lib/data/computeForTests";
import type { Chart } from "@/lib/astrology/types";
import { inDays, loadPushContext } from "./context";

const db = (by: Record<string, unknown[]>) => ({
  from: (table: string) => {
    const q: Record<string, unknown> = { then: (f: (v: unknown) => unknown) => Promise.resolve({ data: by[table] ?? [], error: null }).then(f) };
    for (const m of ["select", "eq", "gte", "lte", "order", "limit"]) q[m] = () => q;
    return q;
  },
});
const load = async (by: Record<string, unknown[]>) =>
  loadPushContext(db(by) as never, { userId: "u", chart: (await computeChartPair()).vedic as Chart, today: "2026-11-25" });

describe("what a notification can be about", () => {
  it("is their own history and dates, with what they already had", async () => {
    const c = await load({
      daily_readings: [{ title: "Old title", created_at: "2026-11-24T01:00:00Z" }],
      alerts: [{ title: "Newer title", created_at: "2026-11-24T09:00:00Z" }],
      conversation_memories: [{ summary: "Asked about a new job.", topics: ["career"], last_message_at: "2026-11-23T10:00:00Z" }],
      predictions: [
        { topic: "career", claim: "A written offer", window_start: "2026-11-01", window_end: "2027-01-31", confidence: "likely" },
        { topic: "health", claim: "Trouble sleeping", window_start: "2026-11-01", window_end: "2027-01-31", confidence: "possible" },
      ],
      user_facts: [{ fact: "Works as a designer", category: "work", updated_at: "2026-11-20" }, { fact: "Has asthma", category: "health", updated_at: "2026-11-20" }],
    });
    expect(c.recent).toEqual(["Newer title", "Old title"]);
    expect(c.block).toContain("2 days ago: Asked about a new job.");
    expect(c.block).toContain("A written offer");
    expect(c.block).toContain("designer");
    expect(c.block).not.toMatch(/asthma|sleeping/);
    expect(c.block).toMatch(/in 11 days \(6 Dec\)/);
    expect(c.tender).toBe(false);
  });
  it("uses nothing they confided when they are hurting", async () => {
    const c = await load({ messages: [{ content: "i want to die", created_at: "2026-11-24" }], conversation_memories: [{ summary: "Asked about a new job.", topics: [], last_message_at: "2026-11-23" }] });
    expect(c.tender).toBe(true);
    expect(c.block).not.toContain("job");
  });
  it("is not fixed by something shared long ago", async () => {
    expect((await load({ user_facts: [{ fact: "Father passed away", category: "family", updated_at: "2026-01-01" }] })).tender).toBe(false);
  });
  it("works for someone brand new", async () => {
    expect((await load({})).recent).toEqual([]);
  });
});

it("counts days the way people say them", () => {
  expect(inDays("2026-11-25", "2026-11-26")).toBe("tomorrow (26 Nov)");
  expect(inDays("2026-11-25", "2026-12-06")).toBe("in 11 days (6 Dec)");
});
