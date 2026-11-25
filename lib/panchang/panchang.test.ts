import { DateTime } from "luxon";
import { beforeAll, describe, expect, it } from "vitest";
import { describeMuhurat, judgeDay, nakshatraNamesKnown, windowsOf } from "./muhurat";
import { jdOfDateTime, lunarMonth, openSky, panchangDay, type Sky } from "./panchang";

const DELHI = { name: "New Delhi, Delhi, India", lat: 28.6139, lng: 77.209, timezone: "Asia/Kolkata" };
let sky: Sky;
beforeAll(async () => { sky = await openSky(); });
const day = (d: string, place = DELHI) => panchangDay(sky, d, place)!;
const close = (t: DateTime, iso: string, minutes = 3) => expect(Math.abs(t.diff(DateTime.fromISO(iso, { zone: t.zone }), "minutes").minutes)).toBeLessThanOrEqual(minutes);

describe("panchangDay", () => {
  it("matches published almanacs for New Delhi", () => {
    const akshaya = day("2026-04-19");
    expect(akshaya.tithi.name).toBe("Shukla Dwitiya");
    close(akshaya.tithi.until, "2026-04-19T10:49");
    close(akshaya.sunrise, "2026-04-19T05:52");
    const diwali = day("2026-11-08");
    expect(diwali.tithi.name).toBe("Krishna Chaturdashi");
    close(diwali.tithi.until, "2026-11-08T11:27");
  });
  it("puts Rahu Kaal in its eighth of the day and opens each weekday's choghadiya", () => {
    const wed = day("2026-11-25");
    expect(wed.weekday).toBe(3);
    const eighth = wed.sunset.diff(wed.sunrise).milliseconds / 8;
    expect(Math.abs(wed.rahuKaal.from.diff(wed.sunrise).milliseconds - 4 * eighth)).toBeLessThan(5);
    expect(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"].map((d) => day(d).choghadiya[0].name)).toEqual(["Amrit", "Rog", "Labh", "Shubh", "Char", "Kaal", "Udveg"]);
    expect(wed.abhijit).toBeNull();
  });
  it("names the lunar month, and 2026's extra Jyeshtha", () => {
    const month = (d: string) => lunarMonth(sky, jdOfDateTime(day(d).sunrise));
    expect(month("2026-05-25")).toEqual({ month: 2, extra: true });
    expect(month("2026-06-20")).toEqual({ month: 2, extra: false });
    expect(month("2026-11-25")).toEqual({ month: 7, extra: false });
    expect(month("2026-03-25").month).toBe(0);
  });
  it("works in another hemisphere and time zone, and gives up where the sun does not set", () => {
    const ny = day("2026-07-04", { name: "New York", lat: 40.71, lng: -74.0, timezone: "America/New_York" });
    close(ny.sunrise, "2026-07-04T05:29");
    close(ny.sunset, "2026-07-04T20:31");
    expect(day("2026-11-01", { name: "Sydney", lat: -33.87, lng: 151.21, timezone: "Australia/Sydney" }).sunrise.hour).toBe(5);
    expect(panchangDay(sky, "2026-06-21", { lat: 69.65, lng: 18.96, timezone: "Europe/Oslo" })).toBeNull();
  });
});

describe("muhurat", () => {
  it("uses nakshatra names the charts use", () => expect(nakshatraNamesKnown()).toBe(true));
  it("keeps every window clear of Rahu Kaal and Bhadra, in daylight", () => {
    for (let i = 0; i < 60; i++) {
      const d = day(DateTime.fromISO("2026-11-26").plus({ days: i }).toISODate()!);
      for (const w of windowsOf(d)) {
        expect(w.from >= d.sunrise && w.to <= d.sunset).toBe(true);
        for (const bad of [d.rahuKaal, ...d.bhadra]) expect(w.to <= bad.from || w.from >= bad.to).toBe(true);
      }
    }
  });
  it("rules out Kharmas, Chaturmas and the extra month for a wedding, not for a car", () => {
    const stops = (d: string) => judgeDay(sky, day(d), "marriage", []).stops.join();
    expect(stops("2026-12-25")).toContain("Kharmas");
    expect(stops("2026-08-20")).toContain("Chaturmas");
    expect(stops("2026-05-25")).toContain("Adhika");
    expect(judgeDay(sky, day("2026-12-25"), "vehicle", []).stops.join()).not.toContain("Kharmas");
  });
  it("weighs both people's stars", () => {
    const stars = { who: "Asha", moonSign: "Taurus", nakshatra: "Rohini" };
    const d = day("2026-11-26");
    expect(judgeDay(sky, d, "marriage", [stars]).score).toBeGreaterThan(judgeDay(sky, d, "marriage", []).score);
    expect(judgeDay(sky, d, "marriage", [stars, { ...stars, who: "Kabir" }]).good.join()).toContain("Kabir's");
  });
  it("offers good days with hours, or says plainly there are none", async () => {
    const some = await describeMuhurat({ activity: "marriage", from: "2026-11-26", to: "2027-02-25", place: DELHI, natals: [] });
    expect(some).toContain("Good hours:");
    expect(some).not.toContain("Ruled out");
    const none = await describeMuhurat({ activity: "marriage", from: "2026-08-01", to: "2026-08-31", place: DELHI, natals: [] });
    expect(none).toContain("No day from 2026-08-01");
    expect(none).toContain("Chaturmas");
    const one = await describeMuhurat({ activity: "general", from: "2026-11-25", to: "2026-11-25", place: DELHI, natals: [] });
    expect(one).toMatch(/overall: (good|fair|weak|not a muhurat)/);
  });
});
