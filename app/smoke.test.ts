import { describe, it, expect } from "vitest";
import metadata from "./layout";

describe("app scaffold", () => {
  it("layout module loads", () => {
    expect(typeof metadata).toBe("function");
  });
});
