import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { buildTimeline, moonLongitudeFrom, type StoredEvent } from "./build";
import type { Chart } from "@/lib/astrology/types";

const birthUt = DateTime.fromISO("1990-01-01T00:00:00", { zone: "utc" });

const event = (over: Partial<StoredEvent> = {}): StoredEvent => ({
  id: "e1",
  occurred_on: "2020-06-01",
  precision: "month",
  title: "Something happened",
  note: null,
  source: "manual",
  ...over,
});

const build = (events: StoredEvent[], today = "2020-01-01") =>
  buildTimeline({ birthDate: "1990-01-01", moonSiderealLongitude: 0, birthUt, events, today });

describe("buildTimeline", () => {
  it("returns the full life as twelve periods", () => {
    expect(build([]).periods).toHaveLength(12);
  });

  it("marks exactly one period current, and the earlier ones past", () => {
    const { periods } = build([], "2020-01-01");
    expect(periods.filter((p) => p.isCurrent)).toHaveLength(1);
    const current = periods.find((p) => p.isCurrent)!;
    expect(current.lord).toBe("Sun"); // Ketu 1990-97, Venus 97-2017, Sun 2017-23
    expect(periods[0].isPast).toBe(true);
    expect(periods.at(-1)!.isPast).toBe(false);
  });

  it("places an event in the mahadasha and antardasha it fell in", () => {
    const { events } = build([event({ occurred_on: "2020-06-01" })]);
    expect(events[0].mahadasha).toBe("Sun");
    expect(events[0].antardasha).toBeTruthy();
  });

  it("counts events into their period", () => {
    const { periods } = build([
      event({ id: "a", occurred_on: "2020-06-01" }),
      event({ id: "b", occurred_on: "2021-06-01" }),
      event({ id: "c", occurred_on: "1995-06-01" }), // Ketu
    ]);
    expect(periods.find((p) => p.lord === "Sun")!.eventCount).toBe(2);
    expect(periods.find((p) => p.lord === "Ketu")!.eventCount).toBe(1);
  });

  it("sorts events oldest first regardless of insertion order", () => {
    const { events } = build([
      event({ id: "b", occurred_on: "2021-06-01", title: "Later" }),
      event({ id: "a", occurred_on: "1995-06-01", title: "Earlier" }),
    ]);
    expect(events.map((e) => e.title)).toEqual(["Earlier", "Later"]);
  });

  it("leaves periods null for an event beyond the computed span", () => {
    const { events } = build([event({ occurred_on: "2200-01-01" })]);
    expect(events[0].mahadasha).toBeNull();
    expect(events[0].antardasha).toBeNull();
  });

  it("falls back to day precision for an unrecognised value", () => {
    const { events } = build([event({ precision: "nonsense" })]);
    expect(events[0].precision).toBe("day");
  });

  it("treats an unknown source as manual", () => {
    const { events } = build([event({ source: "whatever" })]);
    expect(events[0].source).toBe("manual");
  });
});

describe("moonLongitudeFrom", () => {
  const chart = (planets: Chart["planets"]) => ({ planets }) as Chart;

  it("reassembles longitude from sign and degree", () => {
    // Taurus is the 2nd sign, so 30° + 15.5°.
    const lon = moonLongitudeFrom(
      chart([{ name: "Moon", sign: "Taurus", degree: 15.5, house: 1, retrograde: false }]),
    );
    expect(lon).toBeCloseTo(45.5);
  });

  it("returns null when the chart has no Moon", () => {
    expect(moonLongitudeFrom(chart([]))).toBeNull();
  });

  it("returns null for a sign it does not recognise", () => {
    expect(
      moonLongitudeFrom(chart([{ name: "Moon", sign: "Ophiuchus", degree: 1, house: 1, retrograde: false }])),
    ).toBeNull();
  });
});
