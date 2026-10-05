import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";
import { linkTransaction, rowFor } from "./subscriptions";
import type { VerifiedTransaction } from "./apple";

const NOW = new Date("2026-10-05T12:00:00Z");
const USER = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";

function tx(over: Partial<VerifiedTransaction> = {}): VerifiedTransaction {
  return {
    productId: "com.shivvyas.astra.plus.yearly",
    transactionId: "t2",
    originalTransactionId: "o1",
    expiresAt: new Date("2027-10-05T12:00:00Z"),
    revokedAt: null,
    environment: "Production",
    appAccountToken: USER,
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("rowFor", () => {
  it("grants plus while active and free once revoked", () => {
    expect(rowFor(USER, tx(), NOW)).toMatchObject({ plan: "plus", status: "active", product_id: "com.shivvyas.astra.plus.yearly" });
    expect(rowFor(USER, tx({ revokedAt: NOW }), NOW)).toMatchObject({ plan: "free", status: "revoked" });
    expect(rowFor(USER, tx(), NOW, { status: "grace", expiresAt: new Date("2026-10-10T00:00:00Z") })).toMatchObject({
      plan: "plus",
      status: "grace",
      expires_at: "2026-10-10T00:00:00.000Z",
    });
  });
});

describe("linkTransaction", () => {
  it("refuses a purchase whose appAccountToken names another account", async () => {
    const { db, calls } = fakeDb(() => ({}));
    const r = await linkTransaction(db, OTHER, tx(), NOW);
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(calls).toHaveLength(0);
  });

  it("refuses to move a purchase held by another account without proof", async () => {
    const { db } = fakeDb((c: Call) => (c.ops[0].op === "select" ? { data: { user_id: OTHER } } : {}));
    const r = await linkTransaction(db, USER, tx({ appAccountToken: null }), NOW);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("upserts the verified row for the caller", async () => {
    const { db, calls } = fakeDb(() => ({ data: null }));
    const r = await linkTransaction(db, USER, tx(), NOW);
    expect(r).toMatchObject({ ok: true, stored: true, row: { plan: "plus", user_id: USER } });
    const upsert = calls.flatMap((c) => c.ops).find((o) => o.op === "upsert");
    expect(upsert?.args[1]).toEqual({ onConflict: "user_id" });
  });

  it("does not shorten a subscription when an older renewal arrives late", async () => {
    const later = "2028-01-01T00:00:00.000Z";
    const { db, calls } = fakeDb((c: Call) =>
      c.ops[0].op === "select" && c.ops.some((o) => o.op === "eq" && o.args[0] === "user_id")
        ? { data: { expires_at: later, original_transaction_id: "o1", status: "active" } }
        : { data: null },
    );
    const r = await linkTransaction(db, USER, tx(), NOW);
    expect(r).toMatchObject({ ok: true, row: { expires_at: later } });
    expect(calls.flatMap((c) => c.ops).some((o) => o.op === "upsert")).toBe(false);
  });

  it("succeeds without storing while the table is missing", async () => {
    const { db } = fakeDb(() => ({ error: { code: "PGRST205", message: "subscriptions schema cache" } }));
    expect(await linkTransaction(db, USER, tx(), NOW)).toMatchObject({ ok: true, stored: false });
  });
});
