import { describe, it, expect } from "vitest";
import { timingIcs } from "./ics";
import type { TimingEvent } from "./engine";

const event: TimingEvent = {
  id: "2026-10-31-Jupiter-ingress",
  date: "2026-10-31",
  end: "2027-01-25",
  kind: "ingress",
  body: "Jupiter",
  title: "Jupiter into Leo: your 6th house",
  detail: "Jupiter moves from Cancer into Leo; over your natal Moon, and more text to make this line long enough to fold.",
  houseFromAsc: 6,
  houseFromMoon: 1,
  topics: ["career", "health"],
  tone: "mixed",
};

describe("timingIcs", () => {
  const ics = timingIcs([event], new Date("2026-10-09T12:00:00Z"));
  it("writes one all-day event per window with a stable uid", () => {
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("UID:2026-10-31-Jupiter-ingress@astrya\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261031\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261101\r\n");
    expect(ics).toContain("DTSTAMP:20261009T120000Z\r\n");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
  it("escapes text and folds long lines", () => {
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(String.raw`Leo\; over your natal Moon\,`);
    expect(unfolded).toContain("Window closes 2027-01-25.");
  });
});
