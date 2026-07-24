import { describe, it, expect } from "vitest";
import { resolveTimezone } from "./geo";

describe("resolveTimezone", () => {
  it("maps New Delhi coordinates to Asia/Kolkata", () => {
    expect(resolveTimezone(28.6139, 77.209)).toBe("Asia/Kolkata");
  });
  it("maps New York coordinates to America/New_York", () => {
    expect(resolveTimezone(40.7128, -74.006)).toBe("America/New_York");
  });
});
