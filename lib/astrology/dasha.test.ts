import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { startingDashaLord, computeVimshottari, vimshottariTimeline } from "./dasha";

const NAK_SPAN_TEST = 360 / 27; // 13°20', mirrored from dasha.ts for readability

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

describe("vimshottari timeline", () => {
  // Birth 1990-01-01, Moon at exactly 0° (start of Ashwini) → no balance
  // elapsed, so Ketu runs its full 7 years from birth.
  const birth = DateTime.fromISO("1990-01-01T00:00:00", { zone: "utc" });

  it("returns twelve mahadashas covering 120 years", () => {
    const periods = vimshottariTimeline(0, birth);
    expect(periods).toHaveLength(12);
    expect(periods[0].lord).toBe("Ketu");
    expect(periods[0].start).toBe("1990-01-01");
    expect(periods[0].end).toBe("1996-12-31"); // 7 × 365.25 days
    expect(periods[1].lord).toBe("Venus");
  });

  it("leaves no gap between consecutive mahadashas", () => {
    const periods = vimshottariTimeline(0, birth);
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].start).toBe(periods[i - 1].end);
    }
  });

  it("nests nine antardashas inside each mahadasha", () => {
    const periods = vimshottariTimeline(0, birth);
    expect(periods[0].antardashas).toHaveLength(9);
    // The first antardasha of a mahadasha is always its own lord.
    expect(periods[0].antardashas[0].lord).toBe("Ketu");
    expect(periods[0].antardashas[1].lord).toBe("Venus");
  });

  it("keeps antardashas inside their mahadasha's bounds", () => {
    const periods = vimshottariTimeline(0, birth);
    for (const maha of periods) {
      expect(maha.antardashas[0].start).toBe(maha.start);
      expect(maha.antardashas.at(-1)!.end).toBe(maha.end);
    }
  });

  it("clips the birth mahadasha to birth when part of it already elapsed", () => {
    // Moon halfway through Ashwini → half of Ketu's 7 years is already spent,
    // so the first band is the 3.5-year balance, not the full 7.
    const periods = vimshottariTimeline(NAK_SPAN_TEST / 2, birth);
    expect(periods[0].lord).toBe("Ketu");
    expect(periods[0].start).toBe("1990-01-01");
    expect(periods[0].end).toBe("1993-07-02"); // ~3.5 years
    // The elapsed antardashas are dropped rather than drawn before birth.
    expect(periods[0].antardashas.length).toBeLessThan(9);
    expect(periods[0].antardashas[0].start).toBe("1990-01-01");
  });

  it("agrees with computeVimshottari about the current period", () => {
    const now = DateTime.fromISO("2020-01-01T00:00:00", { zone: "utc" });
    const current = computeVimshottari(0, birth, now);
    const periods = vimshottariTimeline(0, birth);
    const maha = periods.find((p) => p.start <= "2020-01-01" && "2020-01-01" < p.end)!;
    expect(maha.lord).toBe(current.mahadasha);
    const antar = maha.antardashas.find((a) => a.start <= "2020-01-01" && "2020-01-01" < a.end)!;
    expect(antar.lord).toBe(current.antardasha);
  });
});
