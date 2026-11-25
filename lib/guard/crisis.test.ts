import { describe, expect, it } from "vitest";
import { crisisRules, hasHelpline, helplineFor, helplineLine, isCrisis, localHelp } from "./crisis";

describe("isCrisis", () => {
  it("hears it in every language people write in", () => {
    for (const t of [
      "I want to die", "im thinking of ending my life after these rejections", "I don't want to live anymore", "should I kill myself", "there is no point in living", "I've been cutting myself", "no one would miss me if i was gone", "they'd be better off without me",
      "mujhe jeena nahi hai", "marne ka man karta hai", "mai mar jana chahta hu", "aatmahatya karne ka vichar", "mare jivvu nathi", "mane marvu che",
      "मैं आत्महत्या करना चाहता हूँ", "अब जीना नहीं है", "મારે હવે જીવવું નથી", "આત્મહત્યાના વિચાર આવે છે",
      "my husband beats me", "he is threatening to kill me", "I was raped", "mujhe peetta hai",
    ]) expect(isCrisis(t), t).toBe(true);
  });
  it("leaves ordinary questions alone", () => {
    for (const t of [
      "When will I get married?", "I'm dying to know if he likes me", "Will my father be healthy", "mera mar ka grah kaisa hai", "Is Mars killing my career", "I want to live abroad", "jeevan mein safalta",
      "મારી મહાદશા ક્યારે પૂરી થશે", "मंगल दोष क्या है", "My boss is killing me with work", "When did my grandfather die", "Can I end my lease early", "nobody will notice my work", "Will no one care about my promotion",
    ]) expect(isCrisis(t), t).toBe(false);
  });
});

describe("the number given", () => {
  it("is for where they are now", () => {
    expect(helplineFor("in")?.number).toBe("14416");
    expect(helplineFor("US")?.number).toBe("988");
    expect(helplineFor("ZZ")).toBeNull();
    expect(helplineFor(null)).toBeNull();
  });
  it("is in the rules and the line, or the directory where there is none", () => {
    expect(crisisRules("IN")).toContain("14416");
    expect(crisisRules(null)).toContain("findahelpline.com");
    expect(localHelp("GB")).toContain("116 123");
    expect(localHelp("GB")).not.toContain("14416");
    expect(helplineLine("US", "I'm here")).toContain("988");
    expect(helplineLine("IN", "मैं यहाँ हूँ")).toContain("14416");
    expect(helplineLine("IN", "मैं यहाँ हूँ")).toContain("अकेले");
    expect(helplineLine("AU", "હું અહીં છું")).toContain("13 11 14");
  });
  it("is recognised however it is spaced", () => {
    expect(hasHelpline("Call 116123 now", "GB")).toBe(true);
    expect(hasHelpline("Call someone now", "GB")).toBe(false);
    expect(hasHelpline("See findahelpline.com", null)).toBe(true);
  });
});
