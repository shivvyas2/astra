import { DateTime } from "luxon";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { computeChart } from "@/lib/astrology/chart";
import { splitCharts, type ChartBlock } from "./chartBlock";
import { periodsOf, pratyantars, readLookup, runLookup, type LookupInput, type Subject } from "./run";
import { LOOKUP_TOOL, TOPICS } from "./tool";

const BIRTH = { birthDate: "1999-03-14", birthTime: "06:30", lat: 23.02, lng: 72.57, timezone: "Asia/Kolkata" };
let self: Subject, other: Subject, timeless: Subject;
beforeAll(async () => {
  const make = async (name: string, b: typeof BIRTH & { timeKnown?: boolean }): Promise<Subject> => ({ name, chart: await computeChart(b, "vedic"), birthDate: b.birthDate, birthTime: `${b.birthTime}:00`, timezone: b.timezone, place: { name: "Ahmedabad", lat: b.lat, lng: b.lng } });
  self = await make("Asha", BIRTH);
  other = await make("Kabir", { ...BIRTH, birthDate: "1994-01-09", birthTime: "11:20" });
  timeless = await make("Ravi", { ...BIRTH, birthTime: "12:00", timeKnown: false });
});
const find = vi.fn(async () => [{ name: "Surat, Gujarat, India", lat: 21.17, lng: 72.83, timezone: "Asia/Kolkata", country: "India" }]);
const run = (input: Partial<LookupInput>, ctx: Partial<{ self: Subject; other: Subject | null }> = {}) =>
  runLookup({ topics: ["D9"], whose: "self", draw: false, activity: "general", from: null, to: null, place: null, ...input }, { self, other: null, today: "2026-11-25", find, ...ctx });

describe("readLookup", () => {
  it("takes what the tool sends and drops what it should not", () => {
    expect(readLookup({ topics: ["D9", "D9", "nope"], whose: "x", draw: "yes", activity: "party", from: "soon", to: "2026-13-40", place: " " })).toEqual({ topics: ["D9"], whose: "self", draw: false, activity: "general", from: null, to: null, place: null });
    expect(readLookup({ topics: [] })).toBeNull();
    expect(readLookup(null)).toBeNull();
  });
  it("is asked for everything the schema requires", () => {
    const schema = LOOKUP_TOOL.input_schema as unknown as { properties: object; required: string[] };
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
  });
});

describe("runLookup", () => {
  it("answers every topic, and draws only when asked", async () => {
    for (const topic of TOPICS) {
      const plain = await run({ topics: [topic] });
      expect(plain.error).toBeUndefined();
      expect(plain.blocks).toEqual([]);
      expect(plain.content.length).toBeGreaterThan(60);
      const drawn = await run({ topics: [topic], draw: true });
      const drawable = topic !== "sade_sati" && topic !== "muhurat";
      expect(drawn.blocks).toHaveLength(drawable ? 1 : 0);
      if (drawable) expect(splitCharts(drawn.blocks[0])).toHaveLength(1);
    }
  });
  it("draws what it describes", async () => {
    const { content, blocks } = await run({ topics: ["D9"], draw: true });
    const chart = splitCharts(blocks[0])[0] as Extract<ChartBlock, { kind: "chart" }>;
    expect(content).toContain(`Ascendant ${chart.houses[0].sign}`);
    expect(chart.houses.flatMap((h) => h.items)).toHaveLength(9);
    for (const h of chart.houses) for (const item of h.items) expect(content).toContain(`- ${item.replace(" (R)", "")}: ${h.sign}, D9 house ${h.house}`);
  });
  it("draws the birth chart as it is stored", async () => {
    const chart = splitCharts((await run({ topics: ["D1"], draw: true })).blocks[0])[0] as Extract<ChartBlock, { kind: "chart" }>;
    for (const p of self.chart.planets) expect(chart.houses[p.house - 1].items.map((x) => x.replace(" (R)", ""))).toContain(p.name);
  });
  it("gives every main period, and the finer ones running now", async () => {
    const { content } = await run({ topics: ["dasha"] });
    expect(content).toContain("(running now)");
    expect(content).toContain("PRATYANTAR");
    expect(content.match(/^- (Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu): /gm)!.length).toBeGreaterThanOrEqual(8);
  });
  it("has a second person only when they are in the conversation", async () => {
    expect((await run({ whose: "other" })).error).toBe(true);
    const both = await run({ whose: "both", draw: true }, { other });
    expect(both.content).toContain("Asha's D9");
    expect(both.content).toContain("Kabir's D9");
    expect(both.blocks).toHaveLength(2);
  });
  it("without a birth time reads no houses, warns about dates, and draws from the Moon", async () => {
    expect((await run({ topics: ["D9", "ashtakavarga"], draw: true }, { self: timeless })).blocks).toEqual([]);
    expect((await run({ topics: ["D9"] }, { self: timeless })).content).toContain("needs an exact birth time");
    expect((await run({ topics: ["dasha"] }, { self: timeless })).content).toContain("approximate");
    const moon = splitCharts((await run({ topics: ["D1"], draw: true }, { self: timeless })).blocks[0])[0] as Extract<ChartBlock, { kind: "chart" }>;
    expect(moon.id).toBe("Moon");
    expect(moon.houses[0].items).toContain("Moon");
  });
  it("finds a muhurat where they said, or at the birthplace and says so", async () => {
    expect((await run({ topics: ["muhurat"], activity: "vehicle", place: "Surat" })).content).toContain("Surat, Gujarat, India");
    const home = await run({ topics: ["muhurat"], activity: "vehicle" });
    expect(home.content).toContain("Ahmedabad");
    expect(home.content).toContain("birthplace");
    find.mockRejectedValueOnce(new Error("down"));
    expect((await run({ topics: ["muhurat"], place: "Nowhere" })).content).toContain("could not be found");
  });
  it("never looks at the past or further than it may", async () => {
    const past = await run({ topics: ["muhurat"], from: "2020-01-01", to: "2020-01-02" });
    expect(past.content).toContain("2026-11-25 overall");
    expect((await run({ topics: ["muhurat"], from: "2026-12-01", to: "2028-01-01" })).content).toContain("Only 92 days");
  });
});

it("splits a sub-period into nine that fill it", () => {
  const p = pratyantars({ lord: "Saturn", start: "2026-01-01", end: "2028-01-01" });
  expect(p).toHaveLength(9);
  expect(p[0]).toMatch(/^Saturn 2026-01-01/);
  expect(p[8]).toMatch(/2028-01-01$/);
});

it("agrees to the day with the dasha stored on the chart", async () => {
  for (let i = 0; i < 40; i++) {
    const b = { ...BIRTH, birthDate: DateTime.fromISO("1970-01-03").plus({ days: i * 391 }).toISODate()!, birthTime: `${String((i * 7) % 24).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}` };
    const chart = await computeChart(b, "vedic");
    const periods = periodsOf(chart, DateTime.fromISO(`${b.birthDate}T${b.birthTime}`, { zone: b.timezone }).toUTC())!;
    const d = chart.dasha!;
    const maha = periods.find((p) => p.lord === d.mahadasha && p.start === d.mahadashaStart && p.end === d.mahadashaEnd);
    expect(maha?.antardashas.find((a) => a.lord === d.antardasha)).toMatchObject({ start: d.antardashaStart, end: d.antardashaEnd });
  }
});
