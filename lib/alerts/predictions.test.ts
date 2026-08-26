import { describe, it, expect } from "vitest";
import { fallbackPrediction } from "./predictions";

describe("fallbackPrediction", () => {
  it("still says something useful when the model call fails", () => {
    const morning = fallbackPrediction("morning", "Shiv");
    expect(morning.body).toContain("Shiv");
    expect(morning.body.length).toBeLessThanOrEqual(140);
    expect(morning.detail).toContain("In simple words");

    const night = fallbackPrediction("night", "Shiv");
    expect(night.title).not.toBe(morning.title);
    expect(night.detail).toContain("In simple words");
  });
});
