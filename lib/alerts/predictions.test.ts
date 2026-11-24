import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/anthropic", async (orig) => ({ ...(await orig<object>()), anthropic: () => ({ messages: { create } }) }));
vi.mock("@/lib/usage/record", async (orig) => ({ ...(await orig<object>()), trackUsage: () => {} }));

import { composePrediction } from "./predictions";
import { AiUnavailable } from "./unavailable";
import { computeChartPair } from "@/lib/data/computeForTests";
import type { Chart } from "@/lib/astrology/types";

const compose = async () =>
  composePrediction({
    firstName: "Asha",
    chart: (await computeChartPair()).vedic as Chart,
    numerology: { mulank: 5, bhagyank: 9 },
    transits: "",
    today: "Tuesday",
    slot: "morning",
    conditions: [],
  });

let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { spy = vi.spyOn(console, "error").mockImplementation(() => {}); create.mockReset(); });
afterEach(() => spy.mockRestore());

describe("composePrediction", () => {
  it("returns what was written", async () => {
    create.mockResolvedValue({ usage: {}, content: [{ type: "text", text: "TITLE: T\nBODY: B\nDETAIL:\nD" }] });
    expect(await compose()).toEqual({ title: "T", body: "B", detail: "D" });
  });
  it("sends nothing canned when the AI is down, and says why", async () => {
    create.mockRejectedValue(Object.assign(new Error("x"), { status: 400, error: { error: { type: "invalid_request_error" } } }));
    await expect(compose()).rejects.toMatchObject({ reason: "400 invalid_request_error" });
  });
  it("sends nothing when the reply cannot be read", async () => {
    create.mockResolvedValue({ usage: {}, content: [{ type: "text", text: "hello" }] });
    await expect(compose()).rejects.toBeInstanceOf(AiUnavailable);
  });
});
