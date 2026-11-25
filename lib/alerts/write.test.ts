import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiUnavailable } from "./unavailable";
import { writeCopy } from "./write";

const shape = (title: string, body = "Send half of it.") => `TITLE: ${title}\nBODY: ${body}\n\nDETAIL:\nBecause.`;
const call = vi.fn();
const write = (check: object = {}) => writeCopy({ label: "t", task: "go", call, check });
beforeEach(() => { call.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("writeCopy", () => {
  it("costs one call when the line is right, and leaves no label in the reading", async () => {
    call.mockResolvedValue(shape("You keep rehearsing that reply"));
    expect(await write()).toEqual({ title: "You keep rehearsing that reply", body: "Send half of it.", detail: "Because." });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("sends a dull line back once, with the reason", async () => {
    call.mockResolvedValueOnce(shape("A quiet day")).mockResolvedValueOnce(shape("You owe yourself an answer"));
    expect((await write()).title).toBe("You owe yourself an answer");
    expect(JSON.stringify(call.mock.calls[1][0])).toContain("worn-out");
  });
  it("keeps the first when the second is no reading at all", async () => {
    call.mockResolvedValueOnce(shape("A quiet day")).mockResolvedValueOnce("sorry");
    expect((await write()).title).toBe("A quiet day");
  });
  it("never sends a forbidden line", async () => {
    call.mockResolvedValue(shape("Your last chance"));
    await expect(write()).rejects.toBeInstanceOf(AiUnavailable);
    expect(call).toHaveBeenCalledTimes(2);
    call.mockReset().mockResolvedValueOnce(shape("A quiet day")).mockResolvedValueOnce(shape("Your last chance"));
    expect((await write()).title).toBe("A quiet day");
  });
  it("says why the AI could not be reached", async () => {
    call.mockRejectedValue(Object.assign(new Error(), { status: 429 }));
    await expect(write()).rejects.toMatchObject({ reason: "429" });
  });
});
