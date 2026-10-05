import { describe, it, expect } from "vitest";
import { cleanZone, resolveZone, loadDeviceZones } from "./zones";

describe("cleanZone", () => {
  it("accepts real IANA zones and nothing else", () => {
    expect(cleanZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(cleanZone(" America/New_York ")).toBe("America/New_York");
    expect(cleanZone("UTC")).toBe("UTC");
    expect(cleanZone("Mars/Olympus")).toBeNull();
    expect(cleanZone("+05:30")).toBeNull();
    expect(cleanZone("")).toBeNull();
    expect(cleanZone(42)).toBeNull();
    expect(cleanZone("x".repeat(65))).toBeNull();
  });
});

describe("resolveZone", () => {
  it("prefers the phone's zone over the birthplace, and falls back to UTC", () => {
    expect(resolveZone("America/New_York", "Asia/Kolkata")).toBe("America/New_York");
    expect(resolveZone(null, "Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(resolveZone("nonsense", "Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(resolveZone(undefined, null)).toBe("UTC");
  });
});

function fakeDb(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "not", "order", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: result.data ?? null, error: result.error ?? null });
  return { from: () => chain };
}

describe("loadDeviceZones", () => {
  it("keeps the newest zone per user and drops invalid ones", async () => {
    const zones = await loadDeviceZones(
      fakeDb({
        data: [
          { user_id: "a", timezone: "America/New_York", updated_at: "2026-10-05" },
          { user_id: "a", timezone: "Asia/Kolkata", updated_at: "2026-09-01" },
          { user_id: "b", timezone: "Nowhere/Nope", updated_at: "2026-10-05" },
        ],
      }),
    );
    expect(zones.get("a")).toBe("America/New_York");
    expect(zones.has("b")).toBe(false);
  });

  it("is empty, not thrown, when the column does not exist yet", async () => {
    const zones = await loadDeviceZones(fakeDb({ error: { code: "42703", message: "column does not exist" } }));
    expect(zones.size).toBe(0);
  });
});
