import { describe, it, expect } from "vitest";
import { BASIS_TITLE, SIMPLE_TITLE, isReadingLanguage, languageRule } from "./language";
import { splitReading } from "./reading";

describe("languageRule", () => {
  it("adds nothing for English", () => {
    expect(languageRule("english")).toBe("");
  });

  it("asks for the script and the localised section titles", () => {
    const gu = languageRule("gujarati");
    expect(gu).toContain("Gujarati script");
    expect(gu).toContain(SIMPLE_TITLE.gujarati);
    expect(gu).toContain(BASIS_TITLE.gujarati);
    expect(languageRule("hindi")).toContain("Devanagari");
  });

  it("keeps Sanskrit to the terms, in English prose", () => {
    const sa = languageRule("sanskrit");
    expect(sa).toContain("plain English");
    expect(sa).toContain("Surya");
  });

  it("keeps a reply shape's labels in English when asked", () => {
    expect(languageRule("hindi", { structured: true })).toContain("TITLE:");
    expect(languageRule("hindi")).not.toContain("TITLE:");
  });

  it("never uses an em dash", () => {
    for (const l of ["hindi", "gujarati", "sanskrit"] as const) expect(languageRule(l)).not.toContain("—");
  });
});

describe("isReadingLanguage", () => {
  it("accepts the four and nothing else", () => {
    expect(isReadingLanguage("gujarati")).toBe(true);
    expect(isReadingLanguage("french")).toBe(false);
    expect(isReadingLanguage(undefined)).toBe(false);
  });
});

describe("splitReading in other languages", () => {
  it("splits a Gujarati reading on its own headings", () => {
    const text = `**કારકિર્દી**\nલખાણ.\n\n**${SIMPLE_TITLE.gujarati}**\nસરળ.\n\n**${BASIS_TITLE.gujarati}**\n- ગુરુ દસમા ભાવમાં`;
    const parts = splitReading(text);
    expect(parts.simple).toContain("સરળ.");
    expect(parts.basis).toEqual(["ગુરુ દસમા ભાવમાં"]);
  });

  it("splits a Hindi reading too", () => {
    const parts = splitReading(`मुख्य.\n\n**${SIMPLE_TITLE.hindi}**\nसरल.`);
    expect(parts.main.trim()).toBe("मुख्य.");
    expect(parts.simple).toContain("सरल.");
  });
});
