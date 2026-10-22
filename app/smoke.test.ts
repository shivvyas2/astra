import { describe, it, expect, vi } from "vitest";

// next/font is compiled by Next itself and is not a callable module under
// vitest; the layout only needs a class name and a variable from each font.
vi.mock("next/font/google", () => {
  const font = () => ({ className: "", variable: "", style: {} });
  return { Noto_Sans_Gujarati: font, Noto_Sans_Devanagari: font };
});

import metadata from "./layout";

describe("app scaffold", () => {
  it("layout module loads", () => {
    expect(typeof metadata).toBe("function");
  });
});
