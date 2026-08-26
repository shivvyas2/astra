import { describe, it, expect } from "vitest";
import { parseAlertJson, fallbackCopy } from "./compose";
import type { Condition } from "@/lib/astrology/doshas";

const sadeSati: Condition = {
  kind: "sade_sati",
  signature: "sade_sati:peak:Taurus",
  label: "Sade Sati (peak phase)",
  severity: "warning",
  scope: "transit",
  detail: "Saturn is transiting Taurus, the 1st from the natal Moon.",
};

describe("parseAlertJson", () => {
  it("reads the object out of a fenced or chatty response", () => {
    const copy = parseAlertJson(
      'Here you go:\n```json\n{"title":"Sade Sati begins","body":"Saturn has reached your Moon sign.","detail":"**What changed**\\nSaturn..."}\n```',
    );
    expect(copy).toMatchObject({ title: "Sade Sati begins", body: "Saturn has reached your Moon sign." });
  });

  it("rejects output missing a field", () => {
    expect(parseAlertJson('{"title":"x","body":"y"}')).toBeNull();
    expect(parseAlertJson("no json here")).toBeNull();
  });
});

describe("fallbackCopy", () => {
  it("still names the condition when the model call fails", () => {
    const copy = fallbackCopy([sadeSati], []);
    expect(copy.title).toContain("Sade Sati");
    expect(copy.body.length).toBeLessThanOrEqual(200);
    expect(copy.detail).toContain("In simple words");
  });

  it("reads as relief when a condition has ended", () => {
    const copy = fallbackCopy([], [sadeSati]);
    expect(copy.title).toContain("eased");
  });
});
