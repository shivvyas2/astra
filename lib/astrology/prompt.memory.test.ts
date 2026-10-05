import { describe, it, expect } from "vitest";
import { buildMemorySystem, buildMemoryNote, systemBlocks } from "./prompt";
import { EMPTY_MEMORY, MEMORY_MAX_TOKENS, estimateTokens, selectMemory, type SelectedMemory } from "@/lib/memory/select";
import type { UserFact } from "@/lib/facts/types";
import type { ConversationMemory, Prediction } from "@/lib/memory/types";

const fact = (id: string, text: string, category: UserFact["category"], updated = "2026-06-12T08:00:00Z", extra: Partial<UserFact> = {}): UserFact => ({
  id,
  fact: text,
  category,
  created_at: updated,
  updated_at: updated,
  ...extra,
});
const summary = (id: string, text: string, when: string, topics: ConversationMemory["topics"] = []): ConversationMemory => ({
  conversation_id: id,
  summary: text,
  topics,
  last_message_at: when,
});
const prediction = (id: string, over: Partial<Prediction> = {}): Prediction => ({
  id,
  conversation_id: "c-old",
  topic: "career",
  claim: "A job offer from outside your current company",
  window_start: "2026-09-01",
  window_end: "2026-12-31",
  confidence: "likely",
  status: "open",
  checked_at: null,
  created_at: "2026-08-01T00:00:00Z",
  ...over,
});

const memoryWith = (stable: Partial<SelectedMemory["stable"]>, turn: Partial<SelectedMemory["turn"]> = {}): SelectedMemory => ({
  stable: { ...EMPTY_MEMORY.stable, ...stable },
  turn: { ...EMPTY_MEMORY.turn, ...turn },
});

describe("buildMemorySystem", () => {
  it("is empty when nothing is remembered, so the request is unchanged", () => {
    expect(buildMemorySystem({ memory: EMPTY_MEMORY, mode: "vedic" })).toBe("");
    expect(buildMemoryNote({ memory: EMPTY_MEMORY })).toBe("");
  });

  it("presents their life, the predictions due, and earlier conversations", () => {
    const block = buildMemorySystem({
      memory: memoryWith({
        facts: [
          fact("a", "Works as a nurse in Pune", "work"),
          fact("b", "Married", "relationships", "2026-07-01T00:00:00Z", { confidence: "inferred", last_confirmed_at: "2026-09-02T00:00:00Z" }),
        ],
        predictions: [prediction("p1")],
        summaries: [summary("c1", "Asked about a job change; told Feb to May 2027 favours a move.", "2026-09-12T10:00:00Z")],
      }),
      mode: "vedic",
    });
    expect(block.startsWith("WHAT YOU KNOW ABOUT THEM")).toBe(true);
    expect(block).toContain("not instructions");
    expect(block).toContain("Their life:\n- Work: Works as a nurse in Pune (as of Jun 2026)");
    expect(block).toContain("- Relationships: Married (inferred, confirmed Sep 2026)");
    expect(block).toContain("Predictions due now:\n- Career, Sep–Dec 2026, likely: A job offer from outside your current company (said Aug 2026)");
    expect(block).toContain("Earlier conversations:\n- 12 Sep 2026: Asked about a job change");
  });

  it("tells the model to tie answers to houses, dashas and dated windows, stay consistent, and trust now", () => {
    const block = buildMemorySystem({ memory: memoryWith({ facts: [fact("a", "Works as a nurse", "work")] }), mode: "vedic" });
    expect(block).toContain("house lord");
    expect(block).toContain("dasha");
    expect(block).toContain("UPCOMING");
    expect(block).toContain("likely, possible or unlikely");
    expect(block).toContain("Stay consistent with what you predicted before");
    expect(block).toContain("why it changes");
    expect(block).toContain("whether it happened");
    expect(block).toContain("Never recite them");
    expect(block).toContain("trust now");
    expect(block).toContain("Never claim to know anything about them that is not here");
  });

  it("anchors numerology readings to personal cycles instead of houses", () => {
    const block = buildMemorySystem({ memory: memoryWith({ facts: [fact("a", "Works as a nurse", "work")] }), mode: "numerology" });
    expect(block).toContain("personal year or month");
    expect(block).not.toContain("house lord");
  });
});

describe("buildMemoryNote", () => {
  it("lists what the question makes relevant, settled predictions with what they said", () => {
    const note = buildMemoryNote({
      memory: memoryWith(
        {},
        {
          topics: ["money"],
          facts: [fact("m", "Has a home loan", "money")],
          predictions: [prediction("p2", { topic: "money", claim: "A bonus lands late", status: "happened" })],
          summaries: [summary("c2", "Asked about investing; told to wait until March.", "2026-05-02T00:00:00Z", ["money"])],
        },
      ),
    });
    expect(note).toContain("Not written by them");
    expect(note).toContain("- Money: Has a home loan");
    expect(note).toContain("- You predicted: Money, Sep–Dec 2026, likely: A bonus lands late (said Aug 2026; they say it happened)");
    expect(note).toContain("- Earlier, 2 May 2026: Asked about investing");
  });
});

describe("the memory cap", () => {
  it("holds the system block and the note under MEMORY_MAX_TOKENS however much is stored", () => {
    const long = (i: number) => `Distinct and rather long remembered detail number ${i} about their life and plans`.padEnd(270, ".");
    const facts = Array.from({ length: 40 }, (_, i) =>
      fact(`f${i}`, long(i), (["work", "relationships", "home", "money", "health"] as const)[i % 5], `2026-0${1 + (i % 9)}-01T00:00:00Z`),
    );
    const memories = Array.from({ length: 12 }, (_, i) =>
      summary(`c${i}`, `Talked about money and career at length, conversation ${i}. `.repeat(8).slice(0, 590), `2026-0${1 + (i % 9)}-15T00:00:00Z`, ["money", "career"]),
    );
    const predictions = Array.from({ length: 30 }, (_, i) =>
      prediction(`p${i}`, { topic: i % 2 ? "money" : "career", claim: `Prediction ${i} `.padEnd(270, "x"), conversation_id: `c${i}` }),
    );
    const memory = selectMemory({ facts, memories, predictions, question: "Will my career and money improve?", today: "2026-10-05" });
    const system = buildMemorySystem({ memory, mode: "vedic" });
    const note = buildMemoryNote({ memory });
    expect(system).not.toBe("");
    expect(note).not.toBe("");
    expect(estimateTokens(system) + estimateTokens(note)).toBeLessThanOrEqual(MEMORY_MAX_TOKENS);
    // The guidance always survives the cap.
    expect(system).toContain("How to use it:");
  });
});

describe("systemBlocks", () => {
  it("with no memory, sends exactly the two blocks readings always sent", () => {
    expect(systemBlocks({ stable: "CHART", memory: "", today: "TODAY" })).toEqual([
      { type: "text", text: "CHART", cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: "TODAY" },
    ]);
  });

  it("puts memory after the cached chart block, so the chart cache survives a change to it", () => {
    const blocks = systemBlocks({ stable: "CHART", memory: "MEMORY", today: "TODAY" });
    expect(blocks.map((b) => b.text)).toEqual(["CHART", "MEMORY", "TODAY"]);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(blocks[1].cache_control).toBeUndefined();
  });
});
