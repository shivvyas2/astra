import { describe, it, expect } from "vitest";
import { scorecard, MIN_CHECKED_FOR_RATE } from "./scorecard";
import type { Prediction } from "./types";

const TODAY = "2026-10-09";
let n = 0;
function p(status: Prediction["status"], over: Partial<Prediction> = {}): Prediction {
  n += 1;
  return {
    id: `p${n}`,
    conversation_id: null,
    topic: "career",
    claim: "A change of role at work",
    window_start: "2026-06-01",
    window_end: "2026-08-31",
    confidence: "possible",
    status,
    checked_at: status === "open" ? null : "2026-09-01T00:00:00Z",
    created_at: "2026-05-01T00:00:00Z",
    ...over,
  };
}

describe("scorecard", () => {
  it("takes the rate over happened and didn't only, leaving 'not sure' out", () => {
    const card = scorecard([p("happened"), p("happened"), p("didnt"), p("unsure"), p("unsure")], TODAY);
    expect(card).toMatchObject({ happened: 2, didnt: 1, unsure: 2, checked: 3, rate: 67, total: 5 });
  });

  it("shows no rate until there are enough answers", () => {
    const few = Array.from({ length: MIN_CHECKED_FOR_RATE - 1 }, () => p("happened"));
    expect(scorecard(few, TODAY).rate).toBeNull();
    expect(scorecard([...few, p("didnt")], TODAY).rate).toBe(67);
  });

  it("splits open predictions into waiting for an answer and still ahead", () => {
    const card = scorecard(
      [p("open", { window_start: TODAY }), p("open", { window_start: "2026-01-01" }), p("open", { window_start: "2027-03-01" })],
      TODAY,
    );
    expect(card).toMatchObject({ awaiting: 2, upcoming: 1, checked: 0, rate: null });
  });

  it("keeps a separate record for the calls it made as likely", () => {
    const card = scorecard(
      [p("happened", { confidence: "likely" }), p("didnt", { confidence: "likely" }), p("happened"), p("unsure", { confidence: "likely" })],
      TODAY,
    );
    expect(card.likely).toEqual({ checked: 2, happened: 1 });
  });

  it("is all zeros for someone with no predictions", () => {
    expect(scorecard([], TODAY)).toMatchObject({ total: 0, checked: 0, rate: null, awaiting: 0, upcoming: 0 });
  });
});
