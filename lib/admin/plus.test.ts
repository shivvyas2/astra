import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { grantExpiry, grantPlus, revokePlus, plusState, ADMIN_GRANT_PRODUCT } from "./plus";

const NOW = new Date("2026-11-09T12:00:00Z");

/** A one-table fake for `subscriptions` supporting what plus.ts calls. */
function fakeDb(initial: Record<string, unknown> | null, missing = false) {
  let row = initial;
  const db = {
    get row() { return row; },
    from() {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () =>
          missing ? { data: null, error: { code: "42P01", message: "relation subscriptions does not exist" } } : { data: row, error: null } }) }),
        upsert: async (r: Record<string, unknown>) => { row = r; return { error: null }; },
        delete: () => ({ eq: async () => { row = null; return { error: null }; } }),
      };
    },
  };
  return db;
}

describe("grantExpiry", () => {
  it("adds from now", () => {
    expect(grantExpiry("1m", NOW)).toBe("2026-12-09T12:00:00.000Z");
    expect(grantExpiry("1y", NOW)).toBe("2027-11-09T12:00:00.000Z");
    expect(grantExpiry("forever", NOW)).toBe("2099-12-31T23:59:59.000Z");
  });
  it("extends from a later current expiry, not an earlier one", () => {
    expect(grantExpiry("1m", NOW, "2027-01-01T00:00:00.000Z")).toBe("2027-02-01T00:00:00.000Z");
    expect(grantExpiry("1m", NOW, "2026-01-01T00:00:00.000Z")).toBe("2026-12-09T12:00:00.000Z");
  });
});

describe("grantPlus / revokePlus", () => {
  it("grants a free user Plus", async () => {
    const db = fakeDb(null);
    expect(await grantPlus(db, "u1", "3m", NOW)).toBe("granted");
    expect(db.row).toMatchObject({ plan: "plus", status: "active", product_id: ADMIN_GRANT_PRODUCT, original_transaction_id: null, expires_at: "2027-02-09T12:00:00.000Z" });
    expect((await plusState(db, "u1", NOW))).toMatchObject({ plan: "plus", source: "admin" });
  });
  it("extends an existing grant", async () => {
    const db = fakeDb({ status: "active", expires_at: "2027-01-01T00:00:00.000Z", product_id: ADMIN_GRANT_PRODUCT, original_transaction_id: null });
    await grantPlus(db, "u1", "1m", NOW);
    expect(db.row?.expires_at).toBe("2027-02-01T00:00:00.000Z");
  });
  it("refuses to overwrite a live App Store subscription", async () => {
    const apple = { status: "active", expires_at: "2027-01-01T00:00:00.000Z", product_id: "com.shivvyas.astra.plus.monthly", original_transaction_id: "123" };
    const db = fakeDb(apple);
    expect(await grantPlus(db, "u1", "1y", NOW)).toBe("apple");
    expect(await revokePlus(db, "u1")).toBe("apple");
    expect(db.row).toBe(apple);
  });
  it("can grant over an expired App Store subscription", async () => {
    const db = fakeDb({ status: "expired", expires_at: "2026-01-01T00:00:00.000Z", product_id: "x", original_transaction_id: "123" });
    expect(await grantPlus(db, "u1", "1m", NOW)).toBe("granted");
  });
  it("revokes a grant", async () => {
    const db = fakeDb(null);
    await grantPlus(db, "u1", "forever", NOW);
    expect((await plusState(db, "u1", NOW)).forever).toBe(true);
    expect(await revokePlus(db, "u1")).toBe("revoked");
    expect((await plusState(db, "u1", NOW)).plan).toBe("free");
  });
  it("reports unavailable before migration 0011", async () => {
    const db = fakeDb(null, true);
    expect(await grantPlus(db, "u1", "1m", NOW)).toBe("unavailable");
    expect((await plusState(db, "u1", NOW)).available).toBe(false);
  });
});
