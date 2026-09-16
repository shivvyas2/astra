import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { buildTimeline, type StoredEvent } from "./build";
import { describeTimelineForPrompt } from "./describe";

const birthUt = DateTime.fromISO("1990-01-01T00:00:00", { zone: "utc" });

const event = (over: Partial<StoredEvent> = {}): StoredEvent => ({
  id: "e1",
  occurred_on: "2020-06-01",
  precision: "month",
  title: "Moved to Pune",
  note: null,
  source: "manual",
  ...over,
});

const build = (events: StoredEvent[] = [], today = "2021-01-01") =>
  buildTimeline({ birthDate: "1990-01-01", moonSiderealLongitude: 0, birthUt, events, today });

describe("describeTimelineForPrompt", () => {
  it("names the current period and lists moments with their periods in vedic mode", () => {
    const text = describeTimelineForPrompt(build([event()]), { tradition: "vedic" });
    expect(text).toContain("LIFE TIMELINE");
    expect(text).toMatch(/Now: Sun period/);
    expect(text).toContain("2020-06 · Moved to Pune · Sun–");
  });

  it("gives western mode the moments but no dasha language", () => {
    const text = describeTimelineForPrompt(build([event()]), { tradition: "western" });
    expect(text).toContain("Moved to Pune");
    expect(text).not.toContain("Now:");
    expect(text).not.toContain("Sun–");
  });

  it("is empty when there are no moments in western mode", () => {
    expect(describeTimelineForPrompt(build(), { tradition: "western" })).toBe("");
  });

  it("still describes the current period in vedic mode with no moments", () => {
    const text = describeTimelineForPrompt(build(), { tradition: "vedic" });
    expect(text).toContain("Now:");
    expect(text).not.toContain("Moments:");
  });

  it("keeps the most recent thirty moments", () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      event({ id: `e${i}`, occurred_on: `${2000 + Math.floor(i / 4)}-0${(i % 4) + 1}-01`, title: `Moment ${i}` }),
    );
    const text = describeTimelineForPrompt(build(events), { tradition: "vedic" });
    expect(text).toContain("Moment 39");
    expect(text).not.toContain("Moment 0 ");
    expect(text.split("\n").filter((l) => l.startsWith("- ")).length).toBe(30);
  });

  it("renders dates at the precision the user gave", () => {
    const text = describeTimelineForPrompt(
      build([event({ occurred_on: "2019-01-01", precision: "year", title: "Started the business" })]),
      { tradition: "vedic" },
    );
    expect(text).toContain("2019 · Started the business");
  });
});
