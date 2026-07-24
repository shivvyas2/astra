import { describe, it, expect } from "vitest";
import { computeNumerology } from "./numerology";

describe("computeNumerology", () => {
  it("mulank reduces the day of birth", () => {
    // 23 -> 2+3 = 5
    expect(computeNumerology("1990-01-23").mulank).toBe(5);
    // 9 -> 9
    expect(computeNumerology("1990-01-09").mulank).toBe(9);
    // 10 -> 1
    expect(computeNumerology("1990-01-10").mulank).toBe(1);
  });
  it("bhagyank reduces the full date digit sum", () => {
    // 1+9+9+0+0+1+2+3 = 25 -> 7
    expect(computeNumerology("1990-01-23").bhagyank).toBe(7);
  });
});
