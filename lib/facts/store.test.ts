import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isMissingTable, loadFacts, applyFactPlan, resetFactsLogForTests } from "./store";
import { fakeDb } from "./testDb";

const row = (id: string, category = "work") => ({
  id,
  fact: `Fact ${id}`,
  category,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
});

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFactsLogForTests();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("isMissingTable", () => {
  it("recognises Postgres and PostgREST missing-table errors", () => {
    expect(isMissingTable({ code: "42P01", message: 'relation "public.user_facts" does not exist' })).toBe(true);
    expect(isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.user_facts' in the schema cache" })).toBe(true);
    expect(isMissingTable({ message: "Could not find the table 'public.user_facts' in the schema cache" })).toBe(true);
  });

  it("does not mistake other failures for a missing table", () => {
    expect(isMissingTable(null)).toBe(false);
    expect(isMissingTable({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingTable({ code: "08006", message: "connection failure" })).toBe(false);
  });
});

describe("loadFacts", () => {
  it("falls back to the 0008 columns when 0009 is not applied", async () => {
    const { db, calls } = fakeDb((call) =>
      String(call.ops[0].args[0]).includes("source")
        ? { error: { code: "42703", message: "column user_facts.source does not exist" } }
        : { data: [row("a")] },
    );
    expect(await loadFacts(db)).toEqual({ facts: [row("a")], available: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].ops[0].args[0]).toBe("id, fact, category, created_at, updated_at");
    expect(error).not.toHaveBeenCalled();
  });

  it("returns the rows, dropping any with an unknown category", async () => {
    const { db, calls } = fakeDb(() => ({ data: [row("a"), row("b", "astrology")] }));
    const result = await loadFacts(db);
    expect(result).toEqual({ facts: [row("a")], available: true });
    expect(calls[0].table).toBe("user_facts");
    expect(calls[0].ops.map((o) => o.op)).toEqual(["select", "order", "limit"]);
  });

  it("reads as no facts, unavailable, when the table is missing — and warns only once", async () => {
    const { db } = fakeDb(() => ({
      error: { code: "PGRST205", message: "Could not find the table 'public.user_facts' in the schema cache" },
    }));
    expect(await loadFacts(db)).toEqual({ facts: [], available: false });
    expect(await loadFacts(db)).toEqual({ facts: [], available: false });
    expect(await loadFacts(db)).toEqual({ facts: [], available: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("reads as no facts when Postgres reports 42P01", async () => {
    const { db } = fakeDb(() => ({ error: { code: "42P01", message: "relation does not exist" } }));
    expect(await loadFacts(db)).toEqual({ facts: [], available: false });
  });

  it("never throws, even when the client itself does", async () => {
    const db = {
      from() {
        throw new Error("network down");
      },
    } as never;
    expect(await loadFacts(db)).toEqual({ facts: [], available: true });
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe("applyFactPlan", () => {
  it("deletes, updates and inserts as the user, filtered on user_id", async () => {
    const { db, calls } = fakeDb(() => ({}));
    const ok = await applyFactPlan(db, {
      userId: "u1",
      conversationId: "c1",
      now: "2026-10-05T00:00:00Z",
      plan: {
        deletes: ["d1"],
        updates: [{ id: "x1", fact: "Married since March 2026" }],
        inserts: [{ fact: "Works as a nurse in Pune", category: "work" }],
      },
    });
    expect(ok).toBe(true);
    expect(calls.map((c) => c.ops.map((o) => o.op).join("."))).toEqual(["delete.in.eq", "update.eq.eq", "insert"]);
    expect(calls[0].ops[2].args).toEqual(["user_id", "u1"]);
    expect(calls[1].ops[0].args[0]).toEqual({
      fact: "Married since March 2026",
      updated_at: "2026-10-05T00:00:00Z",
      last_confirmed_at: "2026-10-05T00:00:00Z",
    });
    expect(calls[2].ops[0].args[0]).toEqual([
      {
        user_id: "u1",
        fact: "Works as a nurse in Pune",
        category: "work",
        source_conversation_id: "c1",
        confidence: "stated",
        source: "chat",
        last_confirmed_at: "2026-10-05T00:00:00Z",
      },
    ]);
  });

  it("without the 0009 columns, retries the write in the 0008 shape and remembers to", async () => {
    const missingColumn = { code: "PGRST204", message: "Could not find the 'source' column of 'user_facts' in the schema cache" };
    const { db, calls } = fakeDb((call) => {
      const row = call.ops[0].args[0] as Record<string, unknown>[] | Record<string, unknown>;
      const first = Array.isArray(row) ? row[0] : row;
      return first && "source" in first ? { error: missingColumn } : {};
    });
    const plan = { deletes: [], updates: [], inserts: [{ fact: "Has a younger sister", category: "family" as const }] };
    expect(await applyFactPlan(db, { userId: "u1", plan, source: "on_device" })).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].ops[0].args[0]).toEqual([
      { user_id: "u1", fact: "Has a younger sister", category: "family", source_conversation_id: null },
    ]);
    // The next write goes straight to the old shape.
    expect(await applyFactPlan(db, { userId: "u1", plan })).toBe(true);
    expect(calls).toHaveLength(3);
    expect(error).not.toHaveBeenCalled();
  });

  it("confirms facts said again by moving only last_confirmed_at", async () => {
    const { db, calls } = fakeDb(() => ({}));
    await applyFactPlan(db, {
      userId: "u1",
      now: "2026-10-05T00:00:00Z",
      plan: { deletes: [], updates: [], inserts: [], confirms: ["x1"] },
    });
    expect(calls[0].ops.map((o) => o.op)).toEqual(["update", "in", "eq"]);
    expect(calls[0].ops[0].args[0]).toEqual({ last_confirmed_at: "2026-10-05T00:00:00Z" });
  });

  it("returns false on a missing table without throwing", async () => {
    const { db } = fakeDb(() => ({ error: { code: "42P01", message: "relation does not exist" } }));
    const ok = await applyFactPlan(db, {
      userId: "u1",
      plan: { deletes: [], updates: [], inserts: [{ fact: "Has a younger sister", category: "family" }] },
    });
    expect(ok).toBe(false);
  });
});
