import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb } from "@/lib/facts/testDb";
import {
  deleteMemory,
  deletePrediction,
  insertPredictions,
  isMissingRelation,
  loadMemories,
  loadMemory,
  loadPredictions,
  planPredictionWrites,
  resetMemoryLogForTests,
  saveMemory,
  setPredictionStatus,
} from "./store";
import type { NewPrediction, Prediction } from "./types";

const missingTable = (table: string) => ({ code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` });

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetMemoryLogForTests();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("isMissingRelation", () => {
  it("recognises missing tables and columns, and nothing else", () => {
    expect(isMissingRelation({ code: "42P01" })).toBe(true);
    expect(isMissingRelation({ code: "PGRST205" })).toBe(true);
    expect(isMissingRelation({ code: "42703" })).toBe(true);
    expect(isMissingRelation({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});

describe("conversation_memories without the table", () => {
  const { db } = fakeDb(() => ({ error: missingTable("conversation_memories") }));

  it("reads as empty and unavailable, warning once", async () => {
    expect(await loadMemories(db)).toEqual({ memories: [], available: false });
    expect(await loadMemory(db, "c1")).toEqual({ memory: null, available: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("fails writes quietly and treats a delete as done", async () => {
    expect(await saveMemory(db, { userId: "u1", conversationId: "c1", summary: "Asked about work", topics: [] })).toBe(false);
    expect(await deleteMemory(db, "u1", "c1")).toBe("missing");
  });
});

describe("predictions without the table", () => {
  const { db } = fakeDb(() => ({ error: { code: "42P01", message: 'relation "public.predictions" does not exist' } }));

  it("reads as empty and unavailable, and every write reports it without throwing", async () => {
    expect(await loadPredictions(db)).toEqual({ predictions: [], available: false });
    const p: NewPrediction = { topic: "career", claim: "A job offer arrives", window_start: "2027-01-01", window_end: "2027-03-31", confidence: "likely" };
    expect(await insertPredictions(db, { userId: "u1", conversationId: "c1", predictions: [p] })).toBe(false);
    expect(await setPredictionStatus(db, { userId: "u1", id: "p1", status: "happened" })).toBe("missing");
    expect(await deletePrediction(db, "u1", "p1")).toBe("missing");
    expect(error).not.toHaveBeenCalled();
  });
});

describe("reads and writes", () => {
  it("drops rows with unknown values and trims dates", async () => {
    const { db } = fakeDb(() => ({
      data: [
        { id: "p1", conversation_id: "c1", topic: "career", claim: "A job offer", window_start: "2027-01-01", window_end: "2027-03-31", confidence: "likely", status: "open", checked_at: null, created_at: "2026-09-01T00:00:00Z" },
        { id: "p2", conversation_id: null, topic: "fame", claim: "Famous", window_start: "2027-01-01", window_end: "2027-03-31", confidence: "likely", status: "open" },
      ],
    }));
    const { predictions } = await loadPredictions(db);
    expect(predictions.map((p) => p.id)).toEqual(["p1"]);
  });

  it("upserts a summary on the conversation id, as the user", async () => {
    const { db, calls } = fakeDb(() => ({}));
    await saveMemory(db, { userId: "u1", conversationId: "c1", summary: "Asked about work", topics: ["career"], now: "2026-10-05T00:00:00Z" });
    expect(calls[0].table).toBe("conversation_memories");
    expect(calls[0].ops[0]).toEqual({
      op: "upsert",
      args: [
        { conversation_id: "c1", user_id: "u1", summary: "Asked about work", topics: ["career"], last_message_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" },
        { onConflict: "conversation_id" },
      ],
    });
  });

  it("records a check-in with its time, and clears it when reopened", async () => {
    const { db, calls } = fakeDb(() => ({}));
    await setPredictionStatus(db, { userId: "u1", id: "p1", status: "didnt", now: "2026-10-05T00:00:00Z" });
    await setPredictionStatus(db, { userId: "u1", id: "p1", status: "open" });
    expect(calls[0].ops[0].args[0]).toEqual({ status: "didnt", checked_at: "2026-10-05T00:00:00Z" });
    expect(calls[1].ops[0].args[0]).toEqual({ status: "open", checked_at: null });
    expect(calls[0].ops.slice(1)).toEqual([
      { op: "eq", args: ["id", "p1"] },
      { op: "eq", args: ["user_id", "u1"] },
    ]);
  });
});

describe("planPredictionWrites", () => {
  const existing = (over: Partial<Prediction> = {}): Prediction => ({
    id: "e1",
    conversation_id: "c0",
    topic: "career",
    claim: "A job offer from outside your company",
    window_start: "2027-01-01",
    window_end: "2027-04-30",
    confidence: "likely",
    status: "open",
    checked_at: null,
    created_at: "2026-09-01T00:00:00Z",
    ...over,
  });
  const candidate = (claim: string, over: Partial<NewPrediction> = {}): NewPrediction => ({
    topic: "career",
    claim,
    window_start: "2027-02-01",
    window_end: "2027-05-31",
    confidence: "likely",
    ...over,
  });

  it("skips a restatement of an open prediction, and repeats within the turn", () => {
    const out = planPredictionWrites(
      [existing()],
      [candidate("A job offer from outside your company."), candidate("A move to a new city"), candidate("A move to a new city")],
    );
    expect(out.map((p) => p.claim)).toEqual(["A move to a new city"]);
  });

  it("keeps the same words on a different topic or a window that does not overlap", () => {
    const out = planPredictionWrites(
      [existing()],
      [candidate("A job offer from outside your company", { window_start: "2028-01-01", window_end: "2028-03-31" })],
    );
    expect(out).toHaveLength(1);
  });

  it("adds at most four a turn, and none past the open cap", () => {
    const many = Array.from({ length: 6 }, (_, i) => candidate(`Distinct event number ${i} happens`, { topic: "money" }));
    expect(planPredictionWrites([], many)).toHaveLength(4);
    const full = Array.from({ length: 80 }, (_, i) => existing({ id: `e${i}`, claim: `Old ${i}`, topic: "health" }));
    expect(planPredictionWrites(full, many)).toHaveLength(0);
  });
});
