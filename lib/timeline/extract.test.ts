import { describe, it, expect } from "vitest";
import { parseExtractedEvents, selectTranscript, buildExtractionSystem } from "./extract";

const bounds = { birthDate: "1990-01-01", today: "2026-08-26" };

describe("parseExtractedEvents", () => {
  it("reads pipe-delimited lines", () => {
    const events = parseExtractedEvents(
      "2019-11 | month | Left the job at the agency\n2022 | year | Started the business",
      bounds,
    );
    expect(events).toEqual([
      { occurredOn: "2019-11-01", precision: "month", title: "Left the job at the agency" },
      { occurredOn: "2022-01-01", precision: "year", title: "Started the business" },
    ]);
  });

  it("returns nothing for NONE", () => {
    expect(parseExtractedEvents("NONE", bounds)).toEqual([]);
  });

  it("keeps day precision when a full date is given", () => {
    const [e] = parseExtractedEvents("2021-03-14 | day | Moved to Austin", bounds);
    expect(e).toEqual({ occurredOn: "2021-03-14", precision: "day", title: "Moved to Austin" });
  });

  it("trusts the date shape over a wrong PRECISION field", () => {
    const [e] = parseExtractedEvents("2019 | day | Something happened", bounds);
    expect(e.precision).toBe("year");
  });

  it("drops events outside the person's life", () => {
    const events = parseExtractedEvents(
      [
        "1985-01 | month | Before they were born",
        "2030-01 | month | In the future",
        "2019-11 | month | Real one",
      ].join("\n"),
      bounds,
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Real one");
  });

  it("drops impossible dates", () => {
    expect(parseExtractedEvents("2019-02-31 | day | Not a day", bounds)).toEqual([]);
    expect(parseExtractedEvents("2019-13 | month | Not a month", bounds)).toEqual([]);
  });

  it("skips malformed and empty lines without losing the good ones", () => {
    const events = parseExtractedEvents(
      "garbage with no pipes\n\n2019-11 | month | Kept\n| | \n",
      bounds,
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Kept");
  });

  it("deduplicates the same event mentioned twice", () => {
    const events = parseExtractedEvents(
      "2019-11 | month | Left the job\n2019-11 | month | left the job",
      bounds,
    );
    expect(events).toHaveLength(1);
  });

  it("sorts oldest first", () => {
    const events = parseExtractedEvents(
      "2022-01 | month | Later\n2019-11 | month | Earlier",
      bounds,
    );
    expect(events.map((e) => e.title)).toEqual(["Earlier", "Later"]);
  });

  it("keeps a pipe-free title when the model adds extra fields", () => {
    const [e] = parseExtractedEvents("2019-11 | month | Left | the job", bounds);
    expect(e.title).toBe("Left | the job");
  });
});

describe("selectTranscript", () => {
  const u = (content: string, createdAt = "2024-01-01T00:00:00Z") => ({ content, createdAt });

  it("prefixes each line with the date it was said", () => {
    expect(selectTranscript([u("I moved to Austin last March")])).toBe(
      "[2024-01-01] I moved to Austin last March",
    );
  });

  it("collapses whitespace so one message stays one line", () => {
    expect(selectTranscript([u("line one\n\nline two")])).toBe("[2024-01-01] line one line two");
  });

  it("drops messages too short to carry an event", () => {
    expect(selectTranscript([u("ok"), u("thanks")])).toBe("");
  });

  it("stops at the character budget instead of truncating mid-message", () => {
    const long = u("x".repeat(500));
    const out = selectTranscript([long, long, long], 700);
    expect(out.split("\n")).toHaveLength(1);
  });
});

describe("buildExtractionSystem", () => {
  it("bounds the model with the real birth date and today", () => {
    const system = buildExtractionSystem({ birthDate: "1990-01-01", today: "2026-08-26" });
    expect(system).toContain("1990-01-01");
    expect(system).toContain("2026-08-26");
  });
});
