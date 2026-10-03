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
