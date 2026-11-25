import { describe, expect, it } from "vitest";
import { NAKSHATRAS, SIGNS, signIndex } from "./constants";
import { computeChart } from "./chart";
import { describeVarga, VARGAS, vargaChart, vargaSign, type Varga } from "./vargas";

const at = (v: Varga, sign: string, degree: number) => SIGNS[vargaSign(v, signIndex(sign), degree)];

describe("vargaSign", () => {
  it("follows the Parashari rules", () => {
    const cases: [Varga, string, number, string][] = [
      ["D2", "Aries", 10, "Leo"], ["D2", "Aries", 20, "Cancer"], ["D2", "Taurus", 10, "Cancer"], ["D2", "Taurus", 20, "Leo"],
      ["D3", "Aries", 5, "Aries"], ["D3", "Aries", 15, "Leo"], ["D3", "Aries", 25, "Sagittarius"],
      ["D4", "Taurus", 1, "Taurus"], ["D4", "Taurus", 8, "Leo"], ["D4", "Taurus", 29, "Aquarius"],
      ["D7", "Aries", 1, "Aries"], ["D7", "Taurus", 1, "Scorpio"], ["D7", "Aries", 29, "Libra"],
      ["D9", "Aries", 1, "Aries"], ["D9", "Taurus", 1, "Capricorn"], ["D9", "Gemini", 1, "Libra"], ["D9", "Cancer", 1, "Cancer"], ["D9", "Cancer", 29, "Pisces"], ["D9", "Leo", 14, "Leo"],
      ["D10", "Aries", 1, "Aries"], ["D10", "Taurus", 1, "Capricorn"], ["D10", "Taurus", 28, "Libra"],
      ["D12", "Pisces", 1, "Pisces"], ["D12", "Pisces", 29, "Aquarius"],
      ["D16", "Aries", 1, "Aries"], ["D16", "Taurus", 1, "Leo"], ["D16", "Gemini", 1, "Sagittarius"],
      ["D20", "Taurus", 1, "Sagittarius"], ["D20", "Gemini", 1, "Leo"],
      ["D24", "Aries", 0.5, "Leo"], ["D24", "Taurus", 0.5, "Cancer"],
      ["D27", "Taurus", 0.5, "Cancer"], ["D27", "Cancer", 0.5, "Capricorn"],
      ["D30", "Aries", 4, "Aries"], ["D30", "Aries", 7, "Aquarius"], ["D30", "Aries", 12, "Sagittarius"], ["D30", "Aries", 20, "Gemini"], ["D30", "Aries", 27, "Libra"],
      ["D30", "Taurus", 4, "Taurus"], ["D30", "Taurus", 7, "Virgo"], ["D30", "Taurus", 15, "Pisces"], ["D30", "Taurus", 22, "Capricorn"], ["D30", "Taurus", 27, "Scorpio"],
      ["D40", "Taurus", 0.5, "Libra"], ["D45", "Taurus", 0.5, "Leo"], ["D60", "Taurus", 0.2, "Taurus"], ["D60", "Taurus", 0.7, "Gemini"],
    ];
    for (const [v, sign, degree, want] of cases) expect([v, sign, degree, at(v, sign, degree)]).toEqual([v, sign, degree, want]);
  });
  it("agrees with the nakshatra padas, which are the navamsas by another name", () => {
    for (let pada = 0; pada < NAKSHATRAS.length * 4; pada++) {
      const lon = (pada + 0.5) * (360 / 108);
      expect(vargaSign("D9", Math.floor(lon / 30), lon % 30)).toBe(pada % 12);
    }
  });
  it("never leaves the zodiac, at any degree", () => {
    for (const v of VARGAS) for (let s = 0; s < 12; s++) for (const d of [0, 5, 14.99, 15, 29.99, 30]) expect(SIGNS[vargaSign(v, s, d)]).toBeDefined();
  });
});

describe("vargaChart", () => {
  const birth = { birthDate: "1999-03-14", birthTime: "06:30", lat: 23.02, lng: 72.57, timezone: "Asia/Kolkata" };
  it("places all nine in whole-sign houses from its own ascendant", async () => {
    const d9 = vargaChart(await computeChart(birth, "vedic"), "D9")!;
    expect(d9.planets).toHaveLength(9);
    const rahu = d9.planets.find((p) => p.name === "Rahu")!;
    const ketu = d9.planets.find((p) => p.name === "Ketu")!;
    expect((signIndex(rahu.sign) + 6) % 12).toBe(signIndex(ketu.sign));
    expect(describeVarga(d9)).toContain(`Ascendant ${d9.ascendant}`);
  });
  it("warns when a few minutes would change it, and not otherwise", async () => {
    const chart = await computeChart(birth, "vedic");
    expect(describeVarga(vargaChart({ ...chart, ascendant: { ...chart.ascendant, degree: 10.1 } }, "D9")!)).toContain("Caution");
    expect(describeVarga(vargaChart({ ...chart, ascendant: { ...chart.ascendant, degree: 11.7 } }, "D9")!)).not.toContain("Caution");
  });
  it("is nothing without a birth time, or in a Western chart", async () => {
    expect(vargaChart(await computeChart({ ...birth, timeKnown: false }, "vedic"), "D9")).toBeNull();
    expect(vargaChart(await computeChart(birth, "western"), "D9")).toBeNull();
  });
});
