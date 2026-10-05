import { describe, it, expect } from "vitest";
import { cleanPrediction, cleanSummary, cleanTopics, parseWindowDate, windowLabel, orderPredictions, canCheck, type Prediction } from "./types";

const TODAY = "2026-10-05";
const good = { claim: "A job offer from outside your company.", topic: "career", window_start: "2027-03", window_end: "2027-06", confidence: "likely" };

describe("cleanPrediction", () => {
  it("accepts a dated prediction and widens months to whole months", () => {
    expect(cleanPrediction(good, TODAY)).toEqual({
      claim: "A job offer from outside your company",
      topic: "career",
      window_start: "2027-03-01",
      window_end: "2027-06-30",
      confidence: "likely",
    });
    expect(cleanPrediction({ ...good, window_start: "2027-02", window_end: "2027-02" }, TODAY)?.window_end).toBe("2027-02-28");
  });

  it("rejects bad topics, confidences, lengths and windows", () => {
    expect(cleanPrediction({ ...good, topic: "fame" }, TODAY)).toBeNull();
    expect(cleanPrediction({ ...good, confidence: "certain" }, TODAY)).toBeNull();
    expect(cleanPrediction({ ...good, claim: "Soon" }, TODAY)).toBeNull();
    expect(cleanPrediction({ ...good, claim: "x".repeat(281) }, TODAY)).toBeNull();
    expect(cleanPrediction({ ...good, window_start: "2027-06", window_end: "2027-03" }, TODAY)).toBeNull();
    expect(cleanPrediction({ ...good, window_start: "next year" }, TODAY)).toBeNull();
    expect(cleanPrediction({ ...good, window_start: "2024-01", window_end: "2024-02" }, TODAY)).toBeNull();
    expect(cleanPrediction({ ...good, window_start: "2027-01", window_end: "2045-01" }, TODAY)).toBeNull();
    expect(cleanPrediction("A job offer", TODAY)).toBeNull();
  });

  it("rejects a bare transit, which is the sky and not their life", () => {
    expect(cleanPrediction({ ...good, claim: "Saturn enters Pisces and your 10th house" }, TODAY)).toBeNull();
  });
});

describe("dates and labels", () => {
  it("parses months and days, and refuses impossible dates", () => {
    expect(parseWindowDate("2027-03", false)).toBe("2027-03-01");
    expect(parseWindowDate("2028-02", true)).toBe("2028-02-29");
    expect(parseWindowDate("2027-03-15", true)).toBe("2027-03-15");
    expect(parseWindowDate("2027-13", false)).toBeNull();
    expect(parseWindowDate("2027-02-30", false)).toBeNull();
  });

  it("labels windows compactly", () => {
    expect(windowLabel("2027-03-01", "2027-06-30")).toBe("Mar–Jun 2027");
    expect(windowLabel("2026-12-01", "2027-02-28")).toBe("Dec 2026 – Feb 2027");
    expect(windowLabel("2027-03-01", "2027-03-31")).toBe("Mar 2027");
  });
});

describe("summaries and topics", () => {
  it("cleans a summary to one paragraph within the column limit", () => {
    expect(cleanSummary("  Asked about\n a job change.  ")).toBe("Asked about a job change.");
    expect(cleanSummary("x".repeat(601))).toBeNull();
    expect(cleanSummary(42)).toBeNull();
  });
  it("keeps known topics once each", () => {
    expect(cleanTopics(["Career", "career", "fame", "money"])).toEqual(["career", "money"]);
    expect(cleanTopics("career")).toEqual([]);
  });
});

describe("the predictions list", () => {
  const p = (id: string, over: Partial<Prediction>): Prediction => ({
    id,
    conversation_id: null,
    topic: "career",
    claim: id,
    window_start: "2027-01-01",
    window_end: "2027-02-01",
    confidence: "likely",
    status: "open",
    checked_at: null,
    created_at: "2026-09-01T00:00:00Z",
    ...over,
  });
  it("puts open ones first, soonest first, then the settled ones", () => {
    const ordered = orderPredictions([
      p("late", { window_start: "2027-05-01" }),
      p("done", { status: "happened", checked_at: "2026-10-01T00:00:00Z" }),
      p("soon", { window_start: "2026-09-01" }),
    ]);
    expect(ordered.map((x) => x.id)).toEqual(["soon", "late", "done"]);
  });
  it("asks whether it happened once the window has begun", () => {
    expect(canCheck(p("a", { window_start: "2026-09-01" }), TODAY)).toBe(true);
    expect(canCheck(p("b", { window_start: "2027-01-01" }), TODAY)).toBe(false);
    expect(canCheck(p("c", { window_start: "2026-09-01", status: "didnt" }), TODAY)).toBe(false);
  });
});
