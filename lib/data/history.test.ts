import { describe, it, expect } from "vitest";
import { selectHistory, type Turn } from "./history";

const turn = (role: Turn["role"], size: number, tag: string): Turn => ({
  role,
  content: tag.padEnd(size, "."),
});

describe("selectHistory", () => {
  it("keeps everything when it fits the budget", () => {
    const turns = [turn("user", 50, "q1"), turn("assistant", 100, "a1")];
    expect(selectHistory(turns, 6000)).toEqual(turns);
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

  it("returns nothing for an empty conversation", () => {
    expect(selectHistory([], 6000)).toEqual([]);
  });
});
