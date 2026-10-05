import { describe, it, expect, beforeAll } from "vitest";
import { computeChartPair } from "@/lib/data/birthProfile";
import { computeCompatibility, type ChartPair } from "./compatibility";

// Real charts from the ephemeris, so the whole path — Moon nakshatra, the
// eight kootas, synastry from the stored Western chart — is exercised end to end.
let you: ChartPair;
let them: ChartPair;
let themNoTime: ChartPair;

beforeAll(async () => {
  you = await computeChartPair({ birthDate: "1990-01-01", birthTime: "12:00", lat: 28.6139, lng: 77.209, timezone: "Asia/Kolkata" });
  them = await computeChartPair({ birthDate: "1992-06-15", birthTime: "08:30", lat: 19.076, lng: 72.8777, timezone: "Asia/Kolkata" });
  themNoTime = await computeChartPair({
    birthDate: "1992-06-15",
    birthTime: "12:00",
    lat: 19.076,
    lng: 72.8777,
    timezone: "Asia/Kolkata",
    timeKnown: false,
  });
});

describe("computeCompatibility", () => {
  it("returns the full contract", () => {
    const r = computeCompatibility({ you: { name: "Asha", chart: you }, them: { name: "Ravi", relationship: "partner", chart: them } });
    expect(r.guna.max).toBe(36);
    expect(r.guna.kootas.map((k) => k.name)).toEqual([
      "Varna", "Vashya", "Tara", "Yoni", "Graha Maitri", "Gana", "Bhakoot", "Nadi",
    ]);
    expect(r.guna.kootas.reduce((n, k) => n + k.max, 0)).toBe(36);
    expect(r.guna.total).toBe(r.guna.kootas.reduce((n, k) => n + k.score, 0));
    expect(r.guna.total).toBeGreaterThanOrEqual(0);
    expect(r.guna.total).toBeLessThanOrEqual(36);
    expect(r.guna.doshas.some((d) => d.kind === "mangal")).toBe(true);
    expect(r.guna.verdict.length).toBeGreaterThan(0);
    expect(r.synastry.score0to100).toBeGreaterThanOrEqual(0);
    expect(r.synastry.score0to100).toBeLessThanOrEqual(100);
    expect(r.summary).toContain(`of 36 gunas`);
    expect(r.askPrompt).toContain("Ravi (my partner)");
    expect(r.askPrompt).toContain(`${r.guna.total}/36`.replace(/\.0\//, "/"));
    expect(r.people.you.nakshatra).toBe(you.vedic.planets.find((p) => p.name === "Moon")!.nakshatra);
  });

  it("is deterministic and reports the swapped total", () => {
    const a = computeCompatibility({ you: { name: "Asha", chart: you }, them: { name: "Ravi", chart: them } });
    const b = computeCompatibility({ you: { name: "Asha", chart: you }, them: { name: "Ravi", chart: them }, groom: "them" });
    expect(a).toEqual(computeCompatibility({ you: { name: "Asha", chart: you }, them: { name: "Ravi", chart: them } }));
    expect(a.guna.swappedTotal).toBe(b.guna.total);
    expect(b.guna.swappedTotal).toBe(a.guna.total);
    expect(a.guna.groom).toBe("you");
    expect(b.guna.groom).toBe("them");
  });

  it("handles a partner with no birth time: no Ascendant contacts, Moon-only Mangal check, a caveat", () => {
    const r = computeCompatibility({ you: { name: "Asha", chart: you }, them: { name: "Ravi", chart: themNoTime } });
    expect(r.people.them.timeKnown).toBe(false);
    expect(r.people.them.pada).toBeNull();
    expect(r.synastry.aspects.every((x) => x.b !== "Ascendant")).toBe(true);
    expect(r.guna.doshas.find((d) => d.kind === "mangal")!.note).toMatch(/only the moon was checked for ravi/i);
    expect(r.summary).toMatch(/without ravi's birth time/i);
  });
});
