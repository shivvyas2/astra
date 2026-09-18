import { describe, it, expect, vi } from "vitest";
import { ensureCurrentChart, getBirthProfile, type BirthProfileRow } from "./birthProfile";
import { CHART_SCHEMA_VERSION } from "@/lib/astrology/constants";

function fakeDb(updateImpl: (payload: unknown) => Promise<{ error: unknown }>) {
  const eq = vi.fn(async () => updateImpl(lastPayload));
  let lastPayload: unknown;
  const update = vi.fn((payload: unknown) => {
    lastPayload = payload;
    return { eq };
  });
  const from = vi.fn(() => ({ update }));
  return { from, update, eq } as unknown as Parameters<typeof ensureCurrentChart>[1];
}

/**
 * A fake Db that also serves the `select(...).maybeSingle()` read getBirthProfile
 * makes. Takes the raw `{ data, error }` the read resolves with, so it can
 * stand in for a found row, a missing row, or a genuine read failure.
 */
function fakeReadDb(read: { data: BirthProfileRow | null; error: unknown }) {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const maybeSingle = vi.fn(async () => read);
  const select = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn(() => ({ select, update }));
  return { from, select, update, eq } as unknown as Parameters<typeof getBirthProfile>[0];
}

const baseProfile: BirthProfileRow = {
  id: "row-1",
  user_id: "user-1",
  first_name: "Shiv",
  last_name: "Vyas",
  birth_date: "1998-02-09",
  birth_time: "06:30:00",
  place_name: "Mumbai, India",
  lat: 19.076,
  lng: 72.8777,
  timezone: "Asia/Kolkata",
  avatar_url: null,
  chart: null,
};

describe("ensureCurrentChart", () => {
  it("returns the profile unchanged when there is no stored vedic chart", async () => {
    const db = fakeDb(async () => ({ error: null }));
    const profile = { ...baseProfile, chart: null };
    const result = await ensureCurrentChart(profile, db);
    expect(result).toBe(profile);
    expect((db as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("returns the profile unchanged when the stored chart is already current", async () => {
    const current = { schemaVersion: CHART_SCHEMA_VERSION, derived: {} };
    const profile = { ...baseProfile, chart: { vedic: current, western: current } };
    const db = fakeDb(async () => ({ error: null }));
    const result = await ensureCurrentChart(profile, db);
    expect(result).toBe(profile);
    expect((db as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("recomputes and writes both traditions together for a stale chart", async () => {
    const stale = { schemaVersion: 1 };
    const profile = { ...baseProfile, chart: { vedic: stale, western: stale } };
    let written: unknown;
    const db = fakeDb(async (payload) => {
      written = payload;
      return { error: null };
    });
    const result = await ensureCurrentChart(profile, db);

    // The write and the returned row both carry a rewritten vedic AND western chart.
    expect((written as { chart: { vedic: unknown; western: unknown } }).chart.vedic).toBeTruthy();
    expect((written as { chart: { vedic: unknown; western: unknown } }).chart.western).toBeTruthy();
    expect(result.chart?.vedic).not.toBe(stale);
    expect(result.chart?.western).not.toBe(stale);
    expect((result.chart?.vedic as { schemaVersion?: number }).schemaVersion).toBe(CHART_SCHEMA_VERSION);
  });

  it("swallows a thrown compute/write exception and returns the original profile", async () => {
    const stale = { schemaVersion: 1 };
    const profile = { ...baseProfile, chart: { vedic: stale, western: stale } };
    const db = fakeDb(async () => {
      throw new Error("network down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await ensureCurrentChart(profile, db);
    expect(result).toBe(profile);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // This is the failure mode Supabase actually uses for a rejected write (RLS,
  // a constraint): the call resolves with { error }, it never throws. A naive
  // `await supabase....update(...)` that ignores the returned error would
  // fall through to `return { ...profile, chart: {...} }`, claiming the
  // upgrade succeeded when the row was never written.
  it("swallows a resolved write error (RLS/constraint) and returns the original profile unchanged", async () => {
    const stale = { schemaVersion: 1 };
    const profile = { ...baseProfile, chart: { vedic: stale, western: stale } };
    const db = fakeDb(async () => ({ error: { message: "rls" } }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await ensureCurrentChart(profile, db);

    expect(result).toBe(profile);
    expect(result.chart).toEqual({ vedic: stale, western: stale });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("write failed"), expect.anything());
    spy.mockRestore();
  });
});

describe("getBirthProfile", () => {
  it("returns an upgraded profile when the stored chart is stale", async () => {
    const stale = { schemaVersion: 1 };
    const row = { ...baseProfile, chart: { vedic: stale, western: stale } };
    const db = fakeReadDb({ data: row, error: null });

    const result = await getBirthProfile(db);

    expect(result).not.toBeNull();
    expect(result?.chart?.vedic).not.toBe(stale);
    expect((result?.chart?.vedic as { schemaVersion?: number }).schemaVersion).toBe(CHART_SCHEMA_VERSION);
    expect((db as unknown as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalled();
  });

  it("returns the original profile unchanged when the stored chart is already current", async () => {
    const current = { schemaVersion: CHART_SCHEMA_VERSION, derived: {} };
    const row = { ...baseProfile, chart: { vedic: current, western: current } };
    const db = fakeReadDb({ data: row, error: null });

    const result = await getBirthProfile(db);

    expect(result).toEqual(row);
    expect((db as unknown as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
  });

  it("returns null when there is no stored profile", async () => {
    const db = fakeReadDb({ data: null, error: null });

    const result = await getBirthProfile(db);

    expect(result).toBeNull();
  });

  // supabase-js resolves { data: null, error } on a failed read rather than
  // throwing. A naive `const { data } = await ...` that ignores `error` would
  // fall through to `data ?? null`, rendering a genuine read failure as "no
  // profile" — indistinguishable from a user who never completed intake, to
  // three server-component pages that all read through this function.
  it("throws on a genuine read failure instead of reporting it as no profile", async () => {
    const db = fakeReadDb({ data: null, error: { message: "boom" } });

    await expect(getBirthProfile(db)).rejects.toThrow("boom");
  });
});
