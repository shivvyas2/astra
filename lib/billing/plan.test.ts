import { describe, it, expect, vi } from "vitest";
import { fakeDb } from "@/lib/facts/testDb";
import { getPlan, planFromRow } from "./plan";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("getPlan", () => {
  it("is plus for an active subscription that has not expired", async () => {
    const { db, calls } = fakeDb(() => ({ data: { status: "active", expires_at: future } }));
    expect(await getPlan(db, "u1")).toBe("plus");
    expect(calls[0].table).toBe("subscriptions");
    expect(calls[0].ops).toContainEqual({ op: "eq", args: ["user_id", "u1"] });
  });

  it("is plus during a billing grace period", async () => {
    const { db } = fakeDb(() => ({ data: { status: "grace", expires_at: future } }));
    expect(await getPlan(db, "u1")).toBe("plus");
  });

  it("is free when expired, revoked, past its date, or absent", async () => {
    for (const data of [
      { status: "expired", expires_at: future },
      { status: "revoked", expires_at: future },
      { status: "active", expires_at: past },
      { status: "active", expires_at: null },
      null,
    ]) {
      const { db } = fakeDb(() => ({ data }));
      expect(await getPlan(db, "u1")).toBe("free");
    }
  });

  it("is free when the table is missing (0011 not applied), quietly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb(() => ({ error: { code: "PGRST205", message: "Could not find the table 'public.subscriptions' in the schema cache" } }));
    expect(await getPlan(db, "u1")).toBe("free");
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("is free when the read fails or throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb(() => ({ error: { code: "57014", message: "timeout" } }));
    expect(await getPlan(db, "u1")).toBe("free");
    const { db: throwing } = fakeDb(() => Promise.reject(new Error("network")) as never);
    expect(await getPlan(throwing, "u1")).toBe("free");
    error.mockRestore();
  });
});

describe("planFromRow", () => {
  it("compares against the given clock", () => {
    const row = { status: "active", expires_at: "2026-10-06T00:00:00Z" };
    expect(planFromRow(row, new Date("2026-10-05T00:00:00Z"))).toBe("plus");
    expect(planFromRow(row, new Date("2026-10-06T00:00:01Z"))).toBe("free");
  });
});
