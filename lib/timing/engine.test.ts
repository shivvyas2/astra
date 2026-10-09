import { describe, it, expect } from "vitest";
import { personalTiming, describeTiming, topicsForHouse } from "./engine";
import { scanSky, type SkyEvent } from "./sky";
import type { Chart } from "@/lib/astrology/types";
import type { TimelinePeriod } from "@/lib/timeline/build";

// Pisces rising, Moon in Leo: the 6th house from the ascendant is Leo.
const natal = {
  tradition: "vedic",
  ascendant: { sign: "Pisces", degree: 10 },
  houses: [],
  moonSign: "Leo",
  sunSign: "Pisces",
  planets: [
    { name: "Moon", sign: "Leo", degree: 12, house: 6, retrograde: false },
    { name: "Jupiter", sign: "Scorpio", degree: 21, house: 9, retrograde: true },
    { name: "Mercury", sign: "Aries", degree: 3, house: 2, retrograde: false },
  ],
} as unknown as Chart;

const sky: SkyEvent[] = [
  { kind: "ingress", date: "2026-10-31", body: "Jupiter", sign: "Leo", from: "Cancer", retrograde: false },
  { kind: "ingress", date: "2026-12-06", body: "Rahu", sign: "Capricorn", from: "Aquarius", retrograde: true },
  { kind: "ingress", date: "2026-12-06", body: "Ketu", sign: "Cancer", from: "Leo", retrograde: true },
  { kind: "station", date: "2026-12-13", body: "Jupiter", sign: "Leo", retrograde: true },
  { kind: "ingress", date: "2027-01-25", body: "Jupiter", sign: "Cancer", from: "Leo", retrograde: true },
  { kind: "ingress", date: "2027-06-03", body: "Saturn", sign: "Cancer", from: "Gemini", retrograde: false },
  { kind: "ingress", date: "2028-01-01", body: "Mars", sign: "Aries", from: "Pisces", retrograde: false },
];

const args = { natal, sky, today: "2026-10-09", horizonEnd: "2027-10-09" };

describe("personalTiming", () => {
  it("places each ingress in the house from the ascendant, with its topics and the day the window closes", () => {
    const jupiter = personalTiming(args).find((e) => e.id === "2026-10-31-Jupiter-ingress")!;
    expect(jupiter).toMatchObject({ houseFromAsc: 6, houseFromMoon: 1, end: "2027-01-25", topics: ["career", "health"] });
    expect(jupiter.title).toBe("Jupiter into Leo: your 6th house");
    expect(jupiter.detail).toContain("over your natal Moon");
  });

  it("reads tone from the Moon: Rahu in the 6th from the Moon is helpful, Jupiter in the 12th is hard", () => {
    const events = personalTiming(args);
    expect(events.find((e) => e.body === "Rahu")!.tone).toBe("supportive");
    expect(events.find((e) => e.id === "2027-01-25-Jupiter-ingress")!.tone).toBe("challenging");
  });

  it("says Rahu and Ketu once, without calling the nodes retrograde", () => {
    const nodes = personalTiming(args).filter((e) => e.body === "Rahu" || e.body === "Ketu");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].title).toContain("Rahu and Ketu");
    expect(nodes[0].detail).not.toContain("retrograde");
    expect(nodes[0].detail).toContain("Ketu moves into Cancer");
  });

  it("names Sade Sati when Saturn enters the 12th from the Moon", () => {
    const saturn = personalTiming(args).find((e) => e.body === "Saturn")!;
    expect(saturn.detail).toContain("Sade Sati begins");
    expect(saturn.tone).toBe("challenging");
  });

  it("keeps to the horizon and drops what has already happened", () => {
    const events = personalTiming(args);
    expect(events.some((e) => e.body === "Mars")).toBe(false);
    expect(personalTiming({ ...args, today: "2026-11-01" }).some((e) => e.date === "2026-10-31")).toBe(false);
  });

  it("uses only the Moon when the birth time is unknown", () => {
    const e = personalTiming({ ...args, natal: { ...natal, timeKnown: false } as Chart })[0];
    expect(e.houseFromAsc).toBeNull();
    expect(e.title).toBe("Jupiter into Leo: the 1st from your Moon");
  });

  it("turns sub-period changes inside the horizon into events", () => {
    const periods = [
      { lord: "Moon", start: "2021-09-17", end: "2031-09-18", antardashas: [
        { lord: "Saturn", start: "2025-12-18", end: "2027-07-19" },
        { lord: "Mercury", start: "2027-07-19", end: "2028-12-18" },
      ] },
    ] as unknown as TimelinePeriod[];
    const dasha = personalTiming({ ...args, periods }).filter((e) => e.kind === "dasha");
    expect(dasha).toHaveLength(1);
    expect(dasha[0]).toMatchObject({ date: "2027-07-19", end: "2028-12-18", body: "Mercury", houseFromAsc: 2, topics: ["money", "family"] });
  });
});

describe("describeTiming", () => {
  it("writes one dated line per event for the prompt", () => {
    const text = describeTiming(personalTiming(args), 2);
    expect(text.split("\n")).toEqual([
      "- 2026-10-31: Jupiter into Leo: your 6th house, until 2027-01-25 (mixed) [career, health].",
      "- 2026-12-06: Rahu and Ketu into Capricorn: your 11th house (supportive) [money].",
    ]);
  });
});

describe("topicsForHouse", () => {
  it("maps a house to the parts of life it stands for", () => {
    expect(topicsForHouse(7)).toEqual(["relationships"]);
    expect(topicsForHouse(null)).toEqual([]);
  });
});

describe("scanSky", () => {
  it("settles a sign change to the exact day with the in-between chart", async () => {
    // Saturn leaves Pisces on 2027-06-03: noon charts before that say Pisces.
    const compute = async (day: string) =>
      ({ planets: [{ name: "Saturn", sign: day < "2027-06-03" ? "Pisces" : "Aries", retrograde: false }] }) as unknown as Chart;
    const events = await scanSky("2027-05-28", 1, compute);
    expect(events).toEqual([{ kind: "ingress", date: "2027-06-03", body: "Saturn", sign: "Aries", from: "Pisces", retrograde: false }]);
  });
});
