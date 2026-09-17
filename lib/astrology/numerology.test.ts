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

import { personalYear, personalMonth, loShu, numberRelationship } from "./numerology";

describe("personalYear", () => {
  it("reduces birth month plus birth day plus the current year", () => {
    // 1990-07-15 in 2026: 7 + 15 + 2026 = 2048 -> 2+0+4+8 = 14 -> 5
    expect(personalYear("1990-07-15", "2026-09-17")).toBe(5);
  });

  it("is stable across the whole calendar year", () => {
    expect(personalYear("1990-07-15", "2026-01-01")).toBe(personalYear("1990-07-15", "2026-12-31"));
  });
});

describe("personalMonth", () => {
  it("adds the calendar month to the personal year and reduces", () => {
    // personal year 5 in Sept (9): 5 + 9 = 14 -> 5
    expect(personalMonth("1990-07-15", "2026-09-17")).toBe(5);
  });
});

describe("loShu", () => {
  const grid = loShu("1990-07-15");

  it("counts every digit of the birth date, ignoring zeros", () => {
    // 1 9 9 0 0 7 1 5 -> 1:2, 5:1, 7:1, 9:2
    expect(grid.counts[1]).toBe(2);
    expect(grid.counts[9]).toBe(2);
    expect(grid.counts[7]).toBe(1);
    expect(grid.counts[5]).toBe(1);
  });

  it("lists which digits are missing", () => {
    expect(grid.missing).toEqual([2, 3, 4, 6, 8]);
  });

  it("lists which digits repeat", () => {
    expect(grid.repeated).toEqual([1, 9]);
  });
});

describe("numberRelationship", () => {
  it("reads the friendship of the planets ruling the two numbers", () => {
    expect(numberRelationship(1, 2)).toBe("friend"); // Sun and Moon
    expect(numberRelationship(1, 6)).toBe("enemy"); // Sun and Venus
    expect(numberRelationship(1, 5)).toBe("neutral"); // Sun and Mercury
  });

  it("treats a number as its own friend", () => {
    expect(numberRelationship(3, 3)).toBe("friend");
  });
});
