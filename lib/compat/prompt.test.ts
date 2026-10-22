import { describe, it, expect, beforeAll } from "vitest";
import { computeChartPair } from "@/lib/data/birthProfile";
import { computeCompatibility, type ChartPair } from "./compatibility";
import { describeMatchForPrompt } from "./prompt";

let you: ChartPair;
let them: ChartPair;

beforeAll(async () => {
  you = await computeChartPair({ birthDate: "1990-01-01", birthTime: "12:00", lat: 28.6139, lng: 77.209, timezone: "Asia/Kolkata" });
  them = await computeChartPair({ birthDate: "1992-06-15", birthTime: "08:30", lat: 19.076, lng: 72.8777, timezone: "Asia/Kolkata" });
});

describe("describeMatchForPrompt", () => {
  function block(tradition: "vedic" | "western") {
    const compat = computeCompatibility({
      you: { name: "Asha", chart: you },
      them: { name: "Ravi", relationship: "partner", chart: them },
    });
    return {
      compat,
      text: describeMatchForPrompt({
        you: "Asha",
        them: { name: "Ravi", relationship: "partner", chart: tradition === "vedic" ? them.vedic : them.western! },
        tradition,
        compat,
      }),
    };
  }

  it("gives the other chart, every koota and the doshas for a Vedic reading", () => {
    const { compat, text } = block("vedic");
    expect(text).toContain("THE OTHER PERSON");
    expect(text).toContain("Asha and Ravi (partner)");
    expect(text).toContain(`of 36`);
    for (const k of compat.guna.kootas) expect(text).toContain(`- ${k.name} `);
    expect(text).toContain("Mangal dosha");
    expect(text).toContain("Never recompute a score");
  });

  it("leaves Guna Milan out of a Western reading but keeps synastry", () => {
    const { text } = block("western");
    expect(text).not.toContain("GUNA MILAN");
    expect(text).toContain("SYNASTRY");
  });

  it("never uses an em dash", () => {
    expect(block("vedic").text).not.toContain("—");
  });
});
