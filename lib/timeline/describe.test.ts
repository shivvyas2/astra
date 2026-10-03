import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { buildTimeline, type StoredEvent, type Timeline, type TimelinePeriod } from "./build";
import { describeTimelineForPrompt, describeUpcomingPeriods } from "./describe";

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

describe("describeUpcomingPeriods", () => {
  // A hand-built timeline so the dates are legible in the assertions. Venus
  // runs 2012-04 to 2032-04 with its last three sub-periods spelled out; Sun
  // follows with its first two. `isCurrent` is set per test.
  const period = (over: Partial<TimelinePeriod> & Pick<TimelinePeriod, "lord" | "start" | "end" | "antardashas">): TimelinePeriod => ({
    isCurrent: false,
    isPast: false,
    eventCount: 0,
    theme: null,
    meaning: null,
    stale: true,
    ...over,
  });
  const venus = period({
    lord: "Venus",
    start: "2012-04-01",
    end: "2032-04-01",
    antardashas: [
      { lord: "Saturn", start: "2022-01-01", end: "2025-02-01" },
      { lord: "Mercury", start: "2025-02-01", end: "2027-12-01" },
      { lord: "Ketu", start: "2027-12-01", end: "2029-02-01" },
      { lord: "Venus", start: "2029-02-01", end: "2032-04-01" },
    ],
  });
  const sun = period({
    lord: "Sun",
    start: "2032-04-01",
    end: "2038-04-01",
    antardashas: [
      { lord: "Sun", start: "2032-04-01", end: "2032-07-20" },
      { lord: "Moon", start: "2032-07-20", end: "2033-01-18" },
      { lord: "Mars", start: "2033-01-18", end: "2033-05-26" },
    ],
  });
  const timeline = (current: { lord: string; antardasha: string; start: string; end: string }, today: string): Timeline => ({
    birthDate: "1990-01-01",
    today,
    periods: [venus, sun].map((p) => ({ ...p, isCurrent: p.lord === current.lord })),
    events: [],
    now: { ...current, theme: null, meaning: null },
    needsExplaining: false,
  });

  it("dates the current sub-period's end and counts the months to it", () => {
    const text = describeUpcomingPeriods(
      timeline({ lord: "Venus", antardasha: "Mercury", start: "2025-02-01", end: "2027-12-01" }, "2026-10-02"),
      "2026-10-02",
    );
    expect(text).toContain("- Current sub-period: Venus–Mercury ends 2027-12 (about 14 months from now).");
  });

  it("names the next two sub-periods with their months", () => {
    const text = describeUpcomingPeriods(
      timeline({ lord: "Venus", antardasha: "Mercury", start: "2025-02-01", end: "2027-12-01" }, "2026-10-02"),
      "2026-10-02",
    );
    expect(text).toContain("- Next sub-period: Venus–Ketu, 2027-12 to 2029-02.");
    expect(text).toContain("- Next sub-period: Venus–Venus, 2029-02 to 2032-04.");
    expect(text.split("\n").filter((l) => l.startsWith("- Next sub-period")).length).toBe(2);
  });

  it("leaves the main period change out when it is beyond the horizon", () => {
    const text = describeUpcomingPeriods(
      timeline({ lord: "Venus", antardasha: "Mercury", start: "2025-02-01", end: "2027-12-01" }, "2026-10-02"),
      "2026-10-02",
    );
    expect(text).not.toContain("Main period changes");
  });

  it("crosses into the next mahadasha for the following sub-periods and names the main period change inside the horizon", () => {
    const text = describeUpcomingPeriods(
      timeline({ lord: "Venus", antardasha: "Venus", start: "2029-02-01", end: "2032-04-01" }, "2031-01-15"),
      "2031-01-15",
    );
    expect(text).toContain("- Current sub-period: Venus–Venus ends 2032-04 (about 15 months from now).");
    expect(text).toContain("- Next sub-period: Sun–Sun, 2032-04 to 2032-07.");
    expect(text).toContain("- Next sub-period: Sun–Moon, 2032-07 to 2033-01.");
    expect(text).toContain("- Main period changes: Venus ends 2032-04; Sun begins.");
    // The main period line is last, after the sub-periods.
    const lines = text.split("\n");
    expect(lines[lines.length - 1]).toMatch(/^- Main period changes/);
  });

  it("respects a custom horizon for the main period change", () => {
    const t = timeline({ lord: "Venus", antardasha: "Venus", start: "2029-02-01", end: "2032-04-01" }, "2031-01-15");
    expect(describeUpcomingPeriods(t, "2031-01-15", 12)).not.toContain("Main period changes");
    expect(describeUpcomingPeriods(t, "2031-01-15", 15)).toContain("Main period changes: Venus ends 2032-04; Sun begins.");
  });

  it("never reports negative months when today is past the recorded end", () => {
    const text = describeUpcomingPeriods(
      timeline({ lord: "Venus", antardasha: "Mercury", start: "2025-02-01", end: "2027-12-01" }, "2027-12-20"),
      "2027-12-20",
    );
    expect(text).toContain("(about 0 months from now)");
  });

  it("is empty when there is no current period", () => {
    const t = timeline({ lord: "Venus", antardasha: "Mercury", start: "2025-02-01", end: "2027-12-01" }, "2026-10-02");
    expect(describeUpcomingPeriods({ ...t, now: null }, "2026-10-02")).toBe("");
  });

  it("works on a timeline built from the real dasha engine", () => {
    // Birth 1990-01-01 with the Moon at 0° sidereal: the Sun mahadasha runs
    // 2016-12-31 to 2023-01-01, and on 2021-01-01 the Sun–Mercury sub-period
    // (2020-10-19 to 2021-08-26) is current, with Ketu and Venus to follow.
    const text = describeUpcomingPeriods(build([], "2021-01-01"), "2021-01-01");
    expect(text).toContain("- Current sub-period: Sun–Mercury ends 2021-08 (about 8 months from now).");
    expect(text).toContain("- Next sub-period: Sun–Ketu, 2021-08 to 2022-01.");
    expect(text).toContain("- Next sub-period: Sun–Venus, 2022-01 to 2023-01.");
    // 2023-01-01 is 24 months out, past the default 18-month horizon.
    expect(text).not.toContain("Main period changes");
    expect(describeUpcomingPeriods(build([], "2021-01-01"), "2021-01-01", 30)).toContain(
      "- Main period changes: Sun ends 2023-01; Moon begins.",
    );
  });
});
