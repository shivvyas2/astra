import { describe, expect, it } from "vitest";
import { FLAG_KINDS, readScope, SCOPE_RULES, SCOPE_TOOL } from "./scope";

describe("readScope", () => {
  it("answers in their language, pointing back to the chart", () => {
    const replies = ["english", "hindi", "gujarati", "hinglish", "gujlish"].map((language) => readScope({ kind: "off_topic", language }).reply);
    expect(new Set(replies).size).toBe(5);
    expect(replies[1]).toMatch(/कुंडली/);
    expect(replies[2]).toMatch(/કુંડળી/);
  });
  it("keeps the kind, and copes with anything else", () => {
    for (const kind of FLAG_KINDS) expect(readScope({ kind, language: "english" }).kind).toBe(kind);
    expect(readScope({ kind: "x", language: "klingon" })).toEqual(readScope({ kind: "off_topic", language: "english" }));
    expect(readScope(null).kind).toBe("off_topic");
  });
  it("is told to let life and pain through, and never to predict a death", () => {
    expect(SCOPE_TOOL.description).toMatch(/If unsure, do not call it/);
    expect(SCOPE_TOOL.description).toMatch(/hurting or in danger/);
    expect(SCOPE_RULES).toMatch(/Never predict a death/);
  });
});
