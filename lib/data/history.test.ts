import { describe, it, expect } from "vitest";
import { selectHistory, HISTORY_BUDGET_CHARS, type Turn } from "./history";

const turn = (role: Turn["role"], size: number, tag: string): Turn => ({
  role,
  content: tag.padEnd(size, "."),
});

describe("selectHistory", () => {
  it("keeps everything when it fits the budget", () => {
    const turns = [turn("user", 50, "q1"), turn("assistant", 100, "a1")];
    expect(selectHistory(turns, HISTORY_BUDGET_CHARS)).toEqual(turns);
  });

  it("drops the oldest turns first", () => {
    const turns = [
      turn("user", 100, "old-q"),
      turn("assistant", 100, "old-a"),
      turn("user", 100, "new-q"),
      turn("assistant", 100, "new-a"),
    ];
    const kept = selectHistory(turns, 250);
    expect(kept.map((t) => t.content.slice(0, 5))).toEqual(["new-q", "new-a"]);
  });

  it("never starts on an assistant turn", () => {
    const turns = [turn("user", 400, "q"), turn("assistant", 100, "a"), turn("assistant", 100, "a2")];
    const kept = selectHistory(turns, 250);
    expect(kept).toEqual([]);
  });

  it("keeps the newest turn even when it alone exceeds the budget", () => {
    const turns = [turn("user", 50, "q"), turn("user", 9000, "huge")];
    const kept = selectHistory(turns, 250);
    expect(kept).toHaveLength(1);
    expect(kept[0].content.startsWith("huge")).toBe(true);
  });

  it("defaults to a budget wide enough for a dated reading and the turn it builds on", () => {
    expect(HISTORY_BUDGET_CHARS).toBe(9000);
    const turns = [turn("user", 200, "q1"), turn("assistant", 4000, "a1"), turn("user", 200, "q2"), turn("assistant", 4000, "a2")];
    expect(selectHistory(turns)).toEqual(turns);
  });

  it("returns nothing for an empty conversation", () => {
    expect(selectHistory([], HISTORY_BUDGET_CHARS)).toEqual([]);
  });
});

describe("selectHistory with cacheStable", () => {
  // A long chat: 30 turns of 1,000 characters each, far past a 9,000 budget.
  const chat = (n: number) =>
    Array.from({ length: n }, (_, i) => turn(i % 2 === 0 ? "user" : "assistant", 1000, `t${i}`));
  const firstTag = (kept: Turn[]) => kept[0]?.content.split(".")[0];

  it("is the plain window while the conversation fits", () => {
    const turns = chat(6);
    expect(selectHistory(turns, 9000, { cacheStable: true })).toEqual(selectHistory(turns, 9000));
  });

  it("never keeps less than the plain window", () => {
    for (let n = 1; n <= 40; n++) {
      const turns = chat(n);
      const plain = selectHistory(turns, 9000);
      const stable = selectHistory(turns, 9000, { cacheStable: true });
      expect(stable.length).toBeGreaterThanOrEqual(plain.length);
      expect(stable.slice(stable.length - plain.length)).toEqual(plain);
      expect(stable[0]?.role ?? "user").toBe("user");
    }
  });

  it("holds the same first turn across consecutive messages, where the plain window slides every turn", () => {
    // History as seen on successive user turns (after each assistant reply).
    const starts = [20, 22, 24, 26, 28, 30].map((n) => firstTag(selectHistory(chat(n), 9000, { cacheStable: true })));
    const plainStarts = [20, 22, 24, 26, 28, 30].map((n) => firstTag(selectHistory(chat(n), 9000)));
    expect(new Set(plainStarts).size).toBe(6);
    expect(new Set(starts).size).toBeLessThanOrEqual(3);
  });

  it("falls back to the plain window when the anchor would run far past the budget", () => {
    const turns = [turn("user", 8000, "big"), ...chat(9).slice(1)];
    const stable = selectHistory(turns, 3000, { cacheStable: true });
    expect(stable).toEqual(selectHistory(turns, 3000));
  });
});
