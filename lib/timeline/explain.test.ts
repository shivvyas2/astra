import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { buildTimeline, type StoredEvent } from "./build";
import { buildExplainSystem, buildExplainTask, parseExplanations, eventsHashFor } from "./explain";

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

const build = (events: StoredEvent[] = [], today = "2020-01-01") =>
  buildTimeline({ birthDate: "1990-01-01", moonSiderealLongitude: 0, birthUt, events, today });

describe("eventsHashFor", () => {
  it("is stable for the same events in any order", () => {
    const t = build([event({ id: "a", occurred_on: "2020-06-01" }), event({ id: "b", occurred_on: "2021-01-01", title: "B" })]);
    const sun = t.periods.find((p) => p.lord === "Sun")!;
    const forward = eventsHashFor(sun, t.events);
    const backward = eventsHashFor(sun, [...t.events].reverse());
    expect(forward).toBe(backward);
  });

  it("hashes an empty period to 0 and changes when a moment is added", () => {
    const empty = build();
    const sun = empty.periods.find((p) => p.lord === "Sun")!;
    expect(eventsHashFor(sun, empty.events)).toBe("0");
    const filled = build([event()]);
    expect(eventsHashFor(sun, filled.events)).not.toBe("0");
  });

  it("ignores moments outside the period", () => {
    const t = build([event({ occurred_on: "1995-01-01" })]);
    const sun = t.periods.find((p) => p.lord === "Sun")!;
    expect(eventsHashFor(sun, t.events)).toBe("0");
  });
});

describe("parseExplanations", () => {
  const timeline = build([event()], "2020-01-01");
  const sun = timeline.periods.find((p) => p.lord === "Sun")!;
  const nowStart = timeline.now!.start;

  it("reads a period line and the now line", () => {
    const rows = parseExplanations(
      [
        `Sun | ${sun.start} | Standing on your own feet | A period of stepping forward. You moved to Pune in it.`,
        `now | ${nowStart} | Finding your footing | The Sun period is nearly done; the Mercury sub-period asks for planning.`,
      ].join("\n"),
      timeline,
    );
    expect(rows).toEqual([
      { lord: "Sun", periodStart: sun.start, theme: "Standing on your own feet", meaning: "A period of stepping forward. You moved to Pune in it." },
      { lord: "now", periodStart: nowStart, theme: "Finding your footing", meaning: "The Sun period is nearly done; the Mercury sub-period asks for planning." },
    ]);
  });

  it("drops lines that do not name a real period", () => {
    const rows = parseExplanations(
      [
        `Pluto | ${sun.start} | Not a dasha lord | Nope.`,
        `Sun | 1900-01-01 | Wrong start | Nope.`,
        `Sun | ${sun.start} | Right | Kept.`,
      ].join("\n"),
      timeline,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].theme).toBe("Right");
  });

  it("matches the lord case-insensitively and keeps pipes inside the meaning", () => {
    const [row] = parseExplanations(`SUN | ${sun.start} | Theme | Either this | or that.`, timeline);
    expect(row.lord).toBe("Sun");
    expect(row.meaning).toBe("Either this | or that.");
  });

  it("trims an overlong theme and meaning", () => {
    const [row] = parseExplanations(`Sun | ${sun.start} | ${"t".repeat(100)} | ${"m".repeat(1000)}`, timeline);
    expect(row.theme).toHaveLength(60);
    expect(row.meaning).toHaveLength(600);
  });

  it("skips a line missing a theme or a meaning", () => {
    expect(parseExplanations(`Sun | ${sun.start} |  | Meaning only`, timeline)).toEqual([]);
    expect(parseExplanations(`Sun | ${sun.start} | Theme only |`, timeline)).toEqual([]);
  });
});

describe("prompts", () => {
  it("lists every period, the pinned moments, and asks for a now line", () => {
    const task = buildExplainTask(build([event()], "2020-01-01"));
    for (const lord of ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]) {
      expect(task).toContain(lord);
    }
    expect(task).toContain("Moved to Pune");
    expect(task).toContain("now |");
  });

  it("writes for someone who has never heard the word dasha", () => {
    const system = buildExplainSystem({ firstName: "Asha", birthDate: "1990-01-01", today: "2020-01-01" });
    expect(system).toContain("Asha");
    expect(system.toLowerCase()).toContain("never heard");
  });
});
