import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { startingDashaLord, computeVimshottari } from "./dasha";

describe("vimshottari dasha", () => {
  it("Moon at 0° (Ashwini) starts under Ketu", () => {
    expect(startingDashaLord(0)).toBe("Ketu");
  });
  it("Moon at 40° (start of Magha) starts under Ketu again (cycle repeats)", () => {
    expect(startingDashaLord(120)).toBe("Ketu"); // nakshatra 9 → index%9===0 → Ketu
  });
  it("gives the current mahadasha deterministically", () => {
    // Birth 1990-01-01, Moon at exactly 0° → Ketu 7y (1990→1997), Venus 20y (1997→2017), Sun 6y (2017→2023).
    const birth = DateTime.fromISO("1990-01-01T00:00:00", { zone: "utc" });
    const now = DateTime.fromISO("2020-01-01T00:00:00", { zone: "utc" });
    const d = computeVimshottari(0, birth, now);
    expect(d.mahadasha).toBe("Sun");
  });
});
