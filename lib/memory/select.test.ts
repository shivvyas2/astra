import { describe, it, expect } from "vitest";
import { selectMemory, fitLines, isDue, CORE_CATEGORIES } from "./select";
import { topicsForText, factTopics, TOPIC_HOUSES } from "./topics";
import type { UserFact } from "@/lib/facts/types";
import type { ConversationMemory, Prediction } from "./types";

const fact = (id: string, text: string, category: UserFact["category"], updated = "2026-06-01T00:00:00Z"): UserFact => ({
  id,
  fact: text,
  category,
  created_at: updated,
  updated_at: updated,
});
const memo = (id: string, when: string, topics: ConversationMemory["topics"] = []): ConversationMemory => ({
  conversation_id: id,
  summary: `Summary of ${id}`,
  topics,
  last_message_at: when,
});
const pred = (id: string, over: Partial<Prediction> = {}): Prediction => ({
  id,
  conversation_id: "c-x",
  topic: "career",
  claim: `Claim ${id}`,
  window_start: "2027-03-01",
  window_end: "2027-06-30",
  confidence: "possible",
  status: "open",
  checked_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
const TODAY = "2026-10-05";

describe("topicsForText", () => {
  it("maps everyday words to topics", () => {
    expect(topicsForText("Will I get a promotion this year?")).toEqual(["career"]);
    expect(topicsForText("When will I get married?")).toEqual(["relationships"]);
    expect(topicsForText("Should I take a loan to buy a flat?")).toEqual(["money", "home"]);
    expect(topicsForText("Is moving abroad on a visa a good idea?")).toEqual(["home", "travel"]);
    expect(topicsForText("When will we have a baby?")).toEqual(["children"]);
  });

  it("maps a named house to its topic", () => {
    expect(topicsForText("What does my 7th house say?")).toEqual(["relationships"]);
    expect(topicsForText("Tell me about the tenth lord")).toEqual(["career"]);
    expect(topicsForText("What is in my 11th?")).toEqual(["money"]);
  });

  it("finds nothing in a question about nothing in particular", () => {
    expect(topicsForText("How does the rest of the year look?")).toEqual([]);
  });

  it("gives each topic the houses a reading starts from", () => {
    expect(TOPIC_HOUSES.career).toContain(10);
    expect(TOPIC_HOUSES.relationships).toEqual([7]);
    expect(TOPIC_HOUSES.money).toEqual([2, 11]);
    expect(TOPIC_HOUSES.travel).toEqual([9, 12]);
  });

  it("reads a fact's topics from its category and its words", () => {
    expect(factTopics(fact("a", "Wants to move abroad in 2027", "goals"))).toEqual(["home", "travel"]);
    expect(factTopics(fact("b", "Works as a nurse", "work"))).toEqual(["career"]);
  });
});

describe("selectMemory", () => {
  const facts = [
    fact("w1", "Works as a nurse in Pune", "work", "2026-09-01T00:00:00Z"),
    fact("w2", "Joined the hospital in 2022", "work", "2026-08-01T00:00:00Z"),
    fact("w3", "Studied in Mumbai", "work", "2026-01-01T00:00:00Z"),
    fact("r1", "Married since March 2026", "relationships"),
    fact("h1", "Lives in Pune with in-laws", "home"),
    fact("m1", "Has a home loan", "money"),
    fact("g1", "Wants to buy a car next year", "goals"),
    fact("x1", "Worried about father's health", "worries"),
  ];

  it("always sends the core facts, at most two per core category, newest first", () => {
    const m = selectMemory({ facts, memories: [], predictions: [], question: "Hello", today: TODAY });
    expect(m.stable.facts.map((f) => f.id)).toEqual(["w1", "w2", "r1", "h1"]);
    expect(CORE_CATEGORIES).toEqual(["work", "relationships", "home"]);
    expect(m.turn.facts).toEqual([]);
  });

  it("adds the facts the question's topics make relevant, without repeating core ones", () => {
    const money = selectMemory({ facts, memories: [], predictions: [], question: "Will my finances improve?", today: TODAY });
    expect(money.turn.topics).toEqual(["money"]);
    expect(money.turn.facts.map((f) => f.id)).toEqual(["m1"]);
    const health = selectMemory({ facts, memories: [], predictions: [], question: "How is my family's health?", today: TODAY });
    expect(health.turn.facts.map((f) => f.id)).toEqual(["x1"]);
    const career = selectMemory({ facts, memories: [], predictions: [], question: "Career?", today: TODAY });
    expect(career.turn.facts.map((f) => f.id)).toEqual(["w3"]);
  });

  it("keeps the standing half independent of the question, so it caches", () => {
    const memories = [memo("c1", "2026-09-01T00:00:00Z", ["career"]), memo("c2", "2026-08-01T00:00:00Z", ["money"])];
    const predictions = [pred("p1", { window_start: "2026-09-01", window_end: "2026-11-30" }), pred("p2", { topic: "money" })];
    const a = selectMemory({ facts, memories, predictions, question: "Will my finances improve?", today: TODAY });
    const b = selectMemory({ facts, memories, predictions, question: "When will I travel?", today: TODAY });
    expect(a.stable).toEqual(b.stable);
    expect(a.turn).not.toEqual(b.turn);
  });

  it("sends the three most recent other conversations, and older ones only when on topic", () => {
    const memories = [
      memo("c1", "2026-09-05T00:00:00Z"),
      memo("c2", "2026-09-04T00:00:00Z"),
      memo("c3", "2026-09-03T00:00:00Z"),
      memo("c4", "2026-09-02T00:00:00Z"),
      memo("c5", "2026-01-01T00:00:00Z", ["relationships"]),
      memo("c6", "2026-01-02T00:00:00Z", ["money"]),
    ];
    const m = selectMemory({ facts: [], memories, predictions: [], question: "When will I marry?", conversationId: "c1", today: TODAY });
    // c1 is the conversation being continued: its history is already in the prompt.
    expect(m.stable.summaries.map((s) => s.conversation_id)).toEqual(["c2", "c3", "c4"]);
    expect(m.turn.summaries.map((s) => s.conversation_id)).toEqual(["c5"]);
  });

  it("puts due predictions in the standing half and on-topic ones in the turn", () => {
    const predictions = [
      pred("due", { window_start: "2026-09-01", window_end: "2026-11-30" }),
      pred("future-career", { window_start: "2027-03-01" }),
      pred("money", { topic: "money" }),
      pred("settled", { topic: "career", status: "happened", window_start: "2026-01-01", window_end: "2026-02-28" }),
      pred("mine", { conversation_id: "c-now", window_start: "2026-09-01", window_end: "2026-11-30" }),
    ];
    const m = selectMemory({ facts: [], memories: [], predictions, question: "Any job change?", conversationId: "c-now", today: TODAY });
    expect(m.stable.predictions.map((p) => p.id)).toEqual(["due"]);
    expect(m.turn.predictions.map((p) => p.id)).toEqual(["future-career", "settled"]);
  });

  it("knows when a prediction is due", () => {
    expect(isDue(pred("a", { window_start: "2026-10-20", window_end: "2026-12-01" }), TODAY)).toBe(true);
    expect(isDue(pred("b", { window_start: "2027-01-01", window_end: "2027-02-01" }), TODAY)).toBe(false);
    expect(isDue(pred("c", { window_start: "2026-03-01", window_end: "2026-08-01" }), TODAY)).toBe(true);
    expect(isDue(pred("d", { window_start: "2026-01-01", window_end: "2026-05-01" }), TODAY)).toBe(false);
    expect(isDue(pred("e", { window_start: "2026-09-01", window_end: "2026-12-01", status: "happened" }), TODAY)).toBe(false);
  });
});

describe("fitLines", () => {
  it("keeps lines in priority order while they fit, skipping one that does not", () => {
    expect(fitLines(["aaaa", "bbbbbbbbbb", "cc"], 9)).toEqual(["aaaa", "cc"]);
    expect(fitLines(["aaaa"], 3)).toEqual([]);
  });
});
