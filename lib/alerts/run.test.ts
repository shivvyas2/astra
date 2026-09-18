import { describe, it, expect } from "vitest";
import { partitionForAlerts, deriveHadNatalRows } from "./run";

const c = (signature: string, scope: "natal" | "transit") => ({ signature, scope });

describe("partitionForAlerts", () => {
  it("alerts natal conditions on a first read, when no natal rows exist", () => {
    const { alert, silent } = partitionForAlerts({
      conditions: [c("mangal_dosha:7", "natal"), c("sade_sati:peak", "transit")],
      hadNatalRows: false,
    });
    expect(alert.map((x) => x.signature)).toEqual(["mangal_dosha:7", "sade_sati:peak"]);
    expect(silent).toEqual([]);
  });

  it("never alerts a natal condition once the user has natal rows", () => {
    const { alert, silent } = partitionForAlerts({
      conditions: [c("mangal_dosha:8", "natal"), c("sade_sati:peak", "transit")],
      hadNatalRows: true,
    });
    expect(alert.map((x) => x.signature)).toEqual(["sade_sati:peak"]);
    expect(silent.map((x) => x.signature)).toEqual(["mangal_dosha:8"]);
  });

  it("keeps transit conditions alertable in both cases", () => {
    for (const hadNatalRows of [true, false]) {
      const { alert } = partitionForAlerts({ conditions: [c("kantaka_shani:4", "transit")], hadNatalRows });
      expect(alert).toHaveLength(1);
    }
  });
});

describe("deriveHadNatalRows", () => {
  it("is false when the count query succeeds with zero natal rows", () => {
    expect(deriveHadNatalRows({ count: 0, error: null })).toBe(false);
  });

  it("is true when the count query succeeds with at least one natal row", () => {
    expect(deriveHadNatalRows({ count: 3, error: null })).toBe(true);
  });

  it("fails CLOSED — treats the user as already having natal rows when the count query errors", () => {
    // Supabase returns count: null alongside an error. The naive
    // `(count ?? 0) > 0` would read this as "no natal rows" for an existing
    // user, which is the exact bug this task exists to prevent.
    expect(deriveHadNatalRows({ count: null, error: { message: "boom" } })).toBe(true);
  });
});
