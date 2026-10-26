import { describe, it, expect } from "vitest";
import { displayPhone, isSupportedE164, toE164 } from "./phone";

describe("toE164", () => {
  it("takes the ways people write an Indian mobile", () => {
    for (const input of ["9876543210", "98765 43210", "098765 43210", "+91 98765-43210", "919876543210"]) {
      expect(toE164("IN", input), input).toBe("+919876543210");
    }
  });

  it("refuses what cannot be an Indian mobile", () => {
    for (const input of ["", "12345", "5876543210", "98765432101", "abcdefghij"]) {
      expect(toE164("IN", input), input).toBeNull();
    }
  });

  it("takes common US formats", () => {
    for (const input of ["4155552671", "(415) 555-2671", "415.555.2671", "+1 415 555 2671", "14155552671"]) {
      expect(toE164("US", input), input).toBe("+14155552671");
    }
  });

  it("refuses US area codes and exchanges starting with 0 or 1", () => {
    expect(toE164("US", "1155552671")).toBeNull();
    expect(toE164("US", "4151552671")).toBeNull();
  });
});

describe("displayPhone and isSupportedE164", () => {
  it("formats both countries and leaves others alone", () => {
    expect(displayPhone("+919876543210")).toBe("+91 98765 43210");
    expect(displayPhone("+14155552671")).toBe("+1 (415) 555-2671");
    expect(displayPhone("+447700900123")).toBe("+447700900123");
  });

  it("accepts only numbers this flow sends to", () => {
    expect(isSupportedE164("+919876543210")).toBe(true);
    expect(isSupportedE164("+14155552671")).toBe(true);
    expect(isSupportedE164("+447700900123")).toBe(false);
    expect(isSupportedE164(undefined)).toBe(false);
  });
});
