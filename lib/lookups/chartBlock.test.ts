import { describe, expect, it } from "vitest";
import { SIGNS } from "@/lib/astrology/constants";
import { fitsFullNames, splitCharts, withoutCharts, writeChart, writeDasha, type ChartBlock } from "./chartBlock";
import { parseDetailsLine } from "@/lib/compat/chatMatch";
import { splitReading } from "@/lib/astrology/reading";

const houses = SIGNS.map((sign, i) => ({ house: i + 1, sign, items: i === 0 ? ["Moon", "Jupiter (R)"] : [] }));
const D9 = writeChart("D9", "Asha", houses);

describe("a drawn chart", () => {
  it("is read back as it was written, apart from the words", () => {
    const [chart, words] = splitCharts(`${D9}\n\n**Love**\nYes.`) as [ChartBlock, string];
    expect(chart).toEqual({ kind: "chart", id: "D9", name: "Asha", houses });
    expect(words.trim()).toBe("**Love**\nYes.");
  });
  it("reads a dasha timeline", () => {
    const periods = [{ lord: "Ketu", start: "1999-03-14", end: "2004-01-02" }, { lord: "Venus", start: "2004-01-02", end: "2024-01-02" }];
    expect(splitCharts(writeDasha("Asha", periods))).toEqual([{ kind: "dasha", id: "Dasha", name: "Asha", periods }]);
  });
  it("is held back while it arrives, at every cut", () => {
    for (let n = D9.indexOf("**\n") + 3; n < D9.length; n++) {
      expect(splitCharts(D9.slice(0, n)).filter((p) => typeof p === "string")).toEqual([]);
    }
  });
  it("leaves ordinary readings, and lines that only look like one, alone", () => {
    const reading = "**Career**\nA move.\n\n**In simple words**\nYes.\n\n**Chart basis**\n- Moon: Taurus 4°, house 1";
    expect(splitCharts(reading)).toEqual([reading]);
    expect(splitReading(splitCharts(reading)[0] as string)).toEqual(splitReading(reading));
    const odd = "**Chart D9 (Asha)**\n- Moon is strong\n\nMore.";
    expect(splitCharts(odd)).toEqual([odd]);
  });
  it("cannot be broken by a name", () => {
    const [chart] = splitCharts(writeChart("D1", "A**)\n- 1 Aries: x (", houses)) as ChartBlock[];
    expect(chart.kind).toBe("chart");
    expect(chart.name).not.toMatch(/[*()\n]/);
    expect((splitCharts(writeChart("D1", "**", houses))[0] as ChartBlock).name).toBe("-");
  });
  it("is never mistaken for someone's birth details", () => {
    expect(parseDetailsLine(D9)).toBeNull();
  });
  it("reaches Astrya's memory as a note, not as something to copy", () => {
    const text = withoutCharts(`${D9}\n\n**Love**\nYes.`);
    expect(text).toBe("[The app drew Asha's D9 chart here.]\n\n**Love**\nYes.");
    expect(withoutCharts("**Love**\nYes.")).toBe("**Love**\nYes.");
  });
});

it("writes full names where a house has room for them", () => {
  for (const kite of [1, 4, 7, 10]) expect([4, 5].map((n) => fitsFullNames(kite, n))).toEqual([true, false]);
  for (const triangle of [2, 3, 5, 6, 8, 9, 11, 12]) expect([2, 3].map((n) => fitsFullNames(triangle, n))).toEqual([true, false]);
});
