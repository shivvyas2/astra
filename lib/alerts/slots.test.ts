import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { slotForHour, isSlotDue, isWakingHour } from "./slots";

describe("slotForHour", () => {
  it("delivers the morning reading from 7 and the night one from 20, local time", () => {
    expect(slotForHour(7)).toBe("morning");
    expect(slotForHour(11)).toBe("morning");
    expect(slotForHour(20)).toBe("night");
    expect(slotForHour(23)).toBe("night");
  });

  it("has nothing due outside the two windows", () => {
    for (const hour of [0, 3, 6, 12, 14, 19]) expect(slotForHour(hour)).toBeNull();
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
    expect(isSlotDue(15, [])).toBeNull();
  });
});

describe("isWakingHour", () => {
  it("is daytime only", () => {
    expect(isWakingHour(8)).toBe(true);
    expect(isWakingHour(21)).toBe(true);
    expect(isWakingHour(22)).toBe(false);
    expect(isWakingHour(3)).toBe(false);
  });
});

describe("the two Vercel backstop crons", () => {
  // vercel.json fires at 02:30 and 15:30 UTC. Even if the hourly workflow
  // were off, both India and New York would still get a morning and a night
  // reading from those two runs alone.
  const runs = ["02:30", "15:30"];
  it.each([
    ["Asia/Kolkata", "2026-10-05"],
    ["America/New_York", "2026-07-05"], // daylight time
    ["America/New_York", "2026-01-05"], // standard time
  ])("land one run in each window for %s", (zone, day) => {
    const slots = runs.map((t) => slotForHour(DateTime.fromISO(`${day}T${t}:00Z`).setZone(zone).hour));
    expect(slots.sort()).toEqual(["morning", "night"]);
  });
});
