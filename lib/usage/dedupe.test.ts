import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { answerKey, claimAnswer, resetAnswersForTests, reuseAnswer, REUSE_MS } from "./dedupe";

const key = (message = "Will I change jobs?", extra: Partial<Parameters<typeof answerKey>[0]> = {}) =>
  answerKey({ userId: "u1", conversationId: "c1", tradition: "vedic", deep: false, message, ...extra });

beforeEach(() => resetAnswersForTests());
afterEach(() => vi.useRealTimers());

describe("answer reuse", () => {
  it("has nothing to reuse for a new question", async () => {
    expect(await reuseAnswer(key())).toBeNull();
  });

  it("hands an identical question the in-flight answer once it finishes", async () => {
    const claim = claimAnswer(key());
    const waiting = reuseAnswer(key());
    claim.settle({ text: "Yes, in spring.", conversationId: "c1" });
    expect(await waiting).toEqual({ text: "Yes, in spring.", conversationId: "c1" });
  });

  it("reuses a just-finished answer, but not after the reuse window", async () => {
    vi.useFakeTimers();
    claimAnswer(key()).settle({ text: "Yes.", conversationId: "c1" });
    expect(await reuseAnswer(key())).toMatchObject({ text: "Yes." });
    vi.advanceTimersByTime(REUSE_MS + 1);
    expect(await reuseAnswer(key())).toBeNull();
  });

  it("never reuses a failed or empty answer", async () => {
    const claim = claimAnswer(key());
    const waiting = reuseAnswer(key());
    claim.settle(null);
    expect(await waiting).toBeNull();
    expect(await reuseAnswer(key())).toBeNull();
    claimAnswer(key()).settle({ text: "  ", conversationId: "c1" });
    expect(await reuseAnswer(key())).toBeNull();
  });

  it("tells apart different words, conversations, modes and Deep", async () => {
    claimAnswer(key()).settle({ text: "Yes.", conversationId: "c1" });
    expect(await reuseAnswer(key("Will I move house?"))).toBeNull();
    expect(await reuseAnswer(key(undefined, { conversationId: "c2" }))).toBeNull();
    expect(await reuseAnswer(key(undefined, { tradition: "western" }))).toBeNull();
    expect(await reuseAnswer(key(undefined, { deep: true }))).toBeNull();
    expect(await reuseAnswer(key(undefined, { userId: "u2" }))).toBeNull();
    // Surrounding whitespace is the same question.
    expect(await reuseAnswer(key("  Will I change jobs?  "))).toMatchObject({ text: "Yes." });
  });

  it("stops waiting on an answer that never comes", async () => {
    claimAnswer(key());
    expect(await reuseAnswer(key(), 5)).toBeNull();
  });
});
