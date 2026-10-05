import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "@/lib/facts/testDb";
import {
  CONSENT_VERSION,
  readConsent,
  recordConsent,
  requireConsent,
  resetConsentLogForTests,
  withdrawConsent,
} from "./consent";

const MISSING = { code: "PGRST205", message: "Could not find the table 'public.ai_consents' in the schema cache" };

beforeEach(() => {
  resetConsentLogForTests();
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requireConsent", () => {
  it("lets the reading through when the user agreed to the current version", async () => {
    const { db } = fakeDb(() => ({ data: { version: CONSENT_VERSION } }));
    expect(await requireConsent(db, "u1")).toBeNull();
  });

  it("answers 403 consent_required when there is no row", async () => {
    const { db } = fakeDb(() => ({ data: null }));
    const res = await requireConsent(db, "u1");
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ error: "consent_required", currentVersion: CONSENT_VERSION });
  });

  it("answers 403 when the agreement was to an older notice", async () => {
    const { db } = fakeDb(() => ({ data: { version: "2025-01-01" } }));
    expect((await requireConsent(db, "u1"))?.status).toBe(403);
  });

  it("fails open when the table is missing, warning once", async () => {
    const { db } = fakeDb(() => ({ error: MISSING }));
    expect(await requireConsent(db, "u1")).toBeNull();
    expect(await requireConsent(db, "u1")).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("fails open when the read errors or throws", async () => {
    const { db } = fakeDb(() => ({ error: { code: "57014", message: "timeout" } }));
    expect(await requireConsent(db, "u1")).toBeNull();
    const { db: throwing } = fakeDb(() => Promise.reject(new Error("down")) as never);
    expect(await requireConsent(throwing, "u1")).toBeNull();
  });
});

describe("readConsent / recordConsent / withdrawConsent", () => {
  it("reports stored:false when the table is missing", async () => {
    const { db } = fakeDb(() => ({ error: MISSING }));
    expect(await readConsent(db, "u1")).toEqual({
      accepted: false,
      version: null,
      currentVersion: CONSENT_VERSION,
      stored: false,
    });
  });

  it("upserts the caller's row", async () => {
    const { db, calls } = fakeDb(() => ({}));
    expect(await recordConsent(db, "u1", CONSENT_VERSION, "ios")).toEqual({ ok: true, stored: true });
    const upsert = calls[0].ops.find((o) => o.op === "upsert");
    expect(upsert?.args[0]).toMatchObject({ user_id: "u1", version: CONSENT_VERSION, platform: "ios" });
    expect(upsert?.args[1]).toEqual({ onConflict: "user_id" });
  });

  it("records nothing but succeeds when the table is missing", async () => {
    const { db } = fakeDb(() => ({ error: MISSING }));
    expect(await recordConsent(db, "u1", CONSENT_VERSION, "web")).toEqual({ ok: true, stored: false });
  });

  it("fails on other write errors", async () => {
    const { db } = fakeDb(() => ({ error: { code: "42501", message: "permission denied" } }));
    expect(await recordConsent(db, "u1", CONSENT_VERSION, "web")).toEqual({ ok: false });
  });

  it("withdraws by deleting the row; a missing table is already withdrawn", async () => {
    const { db, calls } = fakeDb(() => ({}));
    expect(await withdrawConsent(db, "u1")).toEqual({ ok: true });
    expect(calls[0].ops.map((o) => o.op)).toEqual(["delete", "eq"]);
    const { db: missing } = fakeDb(() => ({ error: MISSING }));
    expect(await withdrawConsent(missing, "u1")).toEqual({ ok: true });
  });
});
