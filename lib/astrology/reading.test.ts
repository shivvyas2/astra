import { describe, it, expect } from "vitest";
import { splitReading } from "./reading";

const FULL = `**Career**
Saturn in your 10th house asks for patience.

**In simple words**
Yes, around April.

**Chart basis**
- Saturn transiting the 10th house until April 2027
- Mahadasha: Venus until March 2031
`;

describe("splitReading", () => {
  it("separates the body, the simple-words callout and the chart basis", () => {
    const r = splitReading(FULL);
    expect(r.main).toContain("Saturn in your 10th house");
    expect(r.main).not.toContain("In simple words");
    expect(r.simple).toMatch(/^\*\*In simple words\*\*\nYes, around April\.$/);
    expect(r.basis).toEqual(["Saturn transiting the 10th house until April 2027", "Mahadasha: Venus until March 2031"]);
  });

  it("leaves a reading without the sections as plain prose", () => {
    expect(splitReading("**Career**\nSteady.")).toEqual({ main: "**Career**\nSteady.", simple: null, basis: null });
  });

  it("treats a basis heading that has only just streamed in as an empty list", () => {
    const r = splitReading("Body\n\n**In simple words**\nYes.\n\n**Chart basis**");
    expect(r.simple).toBe("**In simple words**\nYes.");
    expect(r.basis).toEqual([]);
  });

  it("handles older readings that end at In simple words", () => {
    const r = splitReading("Body\n\n**In simple words:** keep going.");
    expect(r.simple).toBe("**In simple words:** keep going.");
    expect(r.basis).toBeNull();
  });
});
