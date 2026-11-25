import { describe, expect, it } from "vitest";
import { describeSadeSati, dhaiyaFor, sadeSatiFor, saturnStays } from "./saturn";

/** A published date can fall the day before ours: the sky is read at noon UTC. */
const near = (a: string, b: string) => expect(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000).toBeLessThanOrEqual(1);

describe("Saturn's stays", () => {
  it("match the published ingresses, retrograde returns and all", async () => {
    const s = (await saturnStays()).filter((x) => x.from > "2020-01-01" && x.from < "2028-12-31");
    const want = [["Capricorn", "2020-01-24"], ["Aquarius", "2022-04-29"], ["Capricorn", "2022-07-12"], ["Aquarius", "2023-01-17"], ["Pisces", "2025-03-29"], ["Aries", "2027-06-03"], ["Pisces", "2027-10-20"], ["Aries", "2028-02-23"]];
    expect(s.map((x) => x.sign)).toEqual(want.map(([sign]) => sign));
    want.forEach(([, date], i) => near(s[i].from, date));
  });
  it("leave no gap in two centuries", async () => {
    const s = await saturnStays();
    expect(s[0].from).toBe("1900-01-01");
    expect(s.at(-1)!.to).toBe("2100-01-01");
    for (let i = 1; i < s.length; i++) expect(s[i].from).toBe(s[i - 1].to);
  });
});

describe("Sade Sati", () => {
  it("runs through three signs, once every thirty years or so", async () => {
    const cycles = await sadeSatiFor("Aquarius", "1995-05-05");
    const now = cycles.find((c) => c.from <= "2026-11-25" && "2026-11-25" < c.to)!;
    near(now.from, "2020-01-24");
    near(now.to, "2028-02-23");
    expect(now.phases.map((p) => p.phase)).toEqual(["rising", "peak", "rising", "peak", "setting", "setting"]);
    for (let i = 1; i < cycles.length; i++) expect(Date.parse(cycles[i].from) - Date.parse(cycles[i - 1].to)).toBeGreaterThan(18 * 365 * 86_400_000);
  });
  it("says what is running, and what is not", async () => {
    const on = await describeSadeSati({ moonSign: "Aquarius", birthDate: "1995-05-05", today: "2026-11-25", moonCertain: true });
    expect(on).toContain("(running now)");
    expect(on).not.toContain("It is not running today.");
    const off = await describeSadeSati({ moonSign: "Cancer", birthDate: "1995-05-05", today: "2026-11-25", moonCertain: false });
    expect(off).toContain("It is not running today.");
    expect(off).toContain("birth time is unknown");
  });
  it("finds the Dhaiya signs", async () => {
    const now = (await dhaiyaFor("Sagittarius", "1995-05-05")).find((s) => s.from <= "2026-11-25" && "2026-11-25" < s.to);
    expect(now?.sign).toBe("Pisces");
  });
});
