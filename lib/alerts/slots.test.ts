import { describe, it, expect } from "vitest";
import { slotForHour, isSlotDue } from "./slots";

describe("slotForHour", () => {
  it("splits the user's local day in two", () => {
    expect(slotForHour(0)).toBe("morning");
    expect(slotForHour(8)).toBe("morning");
    expect(slotForHour(13)).toBe("morning");
    expect(slotForHour(14)).toBe("night");
    expect(slotForHour(21)).toBe("night");
    expect(slotForHour(23)).toBe("night");
  });
});

describe("isSlotDue", () => {
  it("returns the current slot when it has not been written", () => {
    expect(isSlotDue(8, [])).toBe("morning");
    expect(isSlotDue(21, ["morning"])).toBe("night");
  });

  it("returns nothing when the current slot already exists", () => {
    expect(isSlotDue(8, ["morning"])).toBeNull();
    expect(isSlotDue(21, ["morning", "night"])).toBeNull();
  });

  it("does not backfill a slot the user has moved past", () => {
    // Evening, and no morning reading was ever written: they get tonight's,
    // not a stale "good morning" hours late.
    expect(isSlotDue(21, [])).toBe("night");
  });
});
