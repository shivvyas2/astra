import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "@/lib/facts/testDb";

vi.mock("@/lib/data/birthProfile", () => ({
  computeChartPair: vi.fn(async () => ({ vedic: { tradition: "vedic", schemaVersion: 2, derived: {} }, western: { tradition: "western" } })),
}));

import {
  createPerson,
  deletePerson,
  isMissingPeopleTable,
  listPeople,
  parsePersonInput,
  personAsInput,
  resetPeopleLogForTests,
  WRITE_ERROR,
} from "./store";
import { computeChartPair } from "@/lib/data/birthProfile";
import { PEOPLE_CEILING, type PersonRow } from "./types";

const person = {
  label: "Priya",
  relationship: "partner",
  first_name: "Priya",
  birth_date: "1995-03-14",
  birth_time: "07:15",
  place_name: "Pune, India",
  lat: 18.52,
  lng: 73.85,
  timezone: "Asia/Kolkata",
};

const missing = { code: "PGRST205", message: "Could not find the table 'public.people' in the schema cache" };

beforeEach(() => {
  resetPeopleLogForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("parsePersonInput", () => {
  it("defaults the label to the first name and the relationship to other", () => {
    const r = parsePersonInput({ ...person, label: "", relationship: undefined });
    expect(r.ok && r.value).toMatchObject({ label: "Priya", relationship: "other", lastName: "" });
  });

  it("rejects an unknown relationship", () => {
    const r = parsePersonInput({ ...person, relationship: "boss" });
    expect(r.ok).toBe(false);
  });

  it("round-trips a stored row, keeping an approximate unknown time", () => {
    const row = {
      ...person, id: "p1", owner_id: "u1", last_name: "", birth_time: "19:00:00", birth_time_known: false,
      chart: null, created_at: "", updated_at: "",
    } as unknown as PersonRow;
    const r = parsePersonInput(personAsInput(row));
    expect(r.ok && r.value).toMatchObject({ birthTimeKnown: false, birthTime: "19:00" });
  });
});

describe("a database without migration 0012", () => {
  it("lists nobody, says the feature is unavailable, and warns once", async () => {
    const { db } = fakeDb(() => ({ error: missing }));
    expect(await listPeople(db)).toEqual({ people: [], available: false });
    await listPeople(db);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("answers a save with 'unavailable' rather than throwing", async () => {
    const { db } = fakeDb(() => ({ error: missing }));
    const parsed = parsePersonInput(person);
    if (!parsed.ok) throw new Error("fixture");
    expect(await createPerson(db, "u1", parsed.value)).toEqual({ ok: false, reason: "unavailable" });
    expect(WRITE_ERROR.unavailable.status).toBe(503);
  });

  it("recognises both shapes of a missing table", () => {
    expect(isMissingPeopleTable({ code: "42P01" })).toBe(true);
    expect(isMissingPeopleTable(missing)).toBe(true);
    expect(isMissingPeopleTable({ code: "23505", message: "duplicate" })).toBe(false);
  });
});

describe("createPerson", () => {
  it("computes the chart through the shared path and writes it with the owner", async () => {
    const { db, calls } = fakeDb((call) => {
      if (call.ops.some((o) => o.op === "insert")) return { data: { id: "p1", ...person } };
      return { data: null, count: 1 } as never;
    });
    const parsed = parsePersonInput({ ...person, birth_time_known: "false", birth_time_approx: "evening" });
    if (!parsed.ok) throw new Error("fixture");
    const r = await createPerson(db, "u1", parsed.value);
    expect(r.ok).toBe(true);
    expect(computeChartPair).toHaveBeenCalledWith(expect.objectContaining({ birthTime: "19:00", timeKnown: false }));
    const insert = calls.find((c) => c.ops.some((o) => o.op === "insert"))!;
    const row = insert.ops.find((o) => o.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ owner_id: "u1", birth_time_known: false, relationship: "partner" });
    expect(row.chart).toBeTruthy();
  });

  it("has no plan cap — only the anti-abuse ceiling, as a plain 400", async () => {
    const parsed = parsePersonInput(person);
    if (!parsed.ok) throw new Error("fixture");
    // A third, a twentieth person: fine.
    const { db: roomy } = fakeDb((call) =>
      call.ops.some((o) => o.op === "insert") ? { data: { id: "p" } } : ({ data: null, count: 19 } as never),
    );
    expect((await createPerson(roomy, "u1", parsed.value)).ok).toBe(true);
    const { db: full } = fakeDb(() => ({ data: null, count: PEOPLE_CEILING }) as never);
    expect(await createPerson(full, "u1", parsed.value)).toEqual({ ok: false, reason: "ceiling" });
    expect(WRITE_ERROR.ceiling.status).toBe(400);
    expect(WRITE_ERROR.ceiling.message).not.toMatch(/plus|plan|upgrade/i);
  });
});

describe("deletePerson", () => {
  it("is scoped to the owner and reports a row that is not theirs as not found", async () => {
    const { db, calls } = fakeDb(() => ({ data: [] }));
    expect(await deletePerson(db, "u1", "p1")).toEqual({ ok: false, reason: "not_found" });
    expect(calls[0].ops).toContainEqual({ op: "eq", args: ["owner_id", "u1"] });
  });
});
