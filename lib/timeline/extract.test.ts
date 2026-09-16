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
      { occurredOn: "2019-11-01", precision: "month", title: "Left the job at the agency", evidence: "" },
      { occurredOn: "2022-01-01", precision: "year", title: "Started the business", evidence: "" },
    ]);
  });

  it("returns nothing for NONE", () => {
    expect(parseExtractedEvents("NONE", bounds)).toEqual([]);
  });

  it("keeps day precision when a full date is given", () => {
    const [e] = parseExtractedEvents("2021-03-14 | day | Moved to Austin", bounds);
    expect(e).toEqual({ occurredOn: "2021-03-14", precision: "day", title: "Moved to Austin", evidence: "" });
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

  it("reads a fourth field as evidence, so a pipe in a title becomes the quote", () => {
    const [e] = parseExtractedEvents("2019-11 | month | Left | the job", bounds);
    expect(e.title).toBe("Left");
    expect(e.evidence).toBe("the job");
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

describe("four-field lines", () => {
  it("reads the evidence after the third pipe", () => {
    const [e] = parseExtractedEvents(
      "2019-11 | month | Left the job at the agency | I quit the agency job in November 2019",
      bounds,
    );
    expect(e.evidence).toBe("I quit the agency job in November 2019");
    expect(e.title).toBe("Left the job at the agency");
  });

  it("keeps an undated event, after the dated ones, with unknown precision", () => {
    const events = parseExtractedEvents(
      ["? | unknown | Father passed away | since my father passed", "2019-11 | month | Kept | said so"].join("\n"),
      bounds,
    );
    expect(events.map((e) => e.title)).toEqual(["Kept", "Father passed away"]);
    expect(events[1]).toEqual({ occurredOn: null, precision: "unknown", title: "Father passed away", evidence: "since my father passed" });
  });

  it("deduplicates undated events by title", () => {
    const events = parseExtractedEvents(
      ["? | unknown | Father passed away | a", "? | unknown | father passed away | b"].join("\n"),
      bounds,
    );
    expect(events).toHaveLength(1);
  });

  it("trims a long evidence quote", () => {
    const [e] = parseExtractedEvents(`2019 | year | Thing | ${"w".repeat(300)}`, bounds);
    expect(e.evidence).toHaveLength(160);
  });
});

describe("extraction prompt", () => {
  it("tells the model how to resolve relative dates and ages, and to keep undated events", () => {
    const system = buildExtractionSystem(bounds);
    expect(system).toContain("message date");
    expect(system).toContain("birth year plus 25");
    expect(system).toContain("write ? for the date");
    expect(system).toContain("EVIDENCE");
  });
});
