import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateKundliPdf, prettyDate, shortDate, type KundliInput } from "./kundli";
import type { Chart } from "@/lib/astrology/types";

/**
 * The kundli PDF.
 *
 * Nothing here checks how it looks — that is what eyes are for. What is checked
 * is the failure that is invisible until someone in the wrong timezone opens
 * the file, and the one that takes the whole route down with a 500.
 */

const chart: Chart = {
  tradition: "vedic",
  ascendant: { sign: "Scorpio", degree: 14.5 },
  houses: [],
  moonSign: "Cancer",
  sunSign: "Leo",
  ayanamsa: 24.17,
  planets: [
    { name: "Sun", sign: "Leo", degree: 21.4, house: 10, retrograde: false, nakshatra: "Purva Phalguni" },
    { name: "Moon", sign: "Cancer", degree: 3.1, house: 9, retrograde: false, nakshatra: "Punarvasu" },
    { name: "Mercury", sign: "Virgo", degree: 8.9, house: 11, retrograde: true, nakshatra: "Uttara Phalguni" },
    { name: "Venus", sign: "Leo", degree: 28.2, house: 10, retrograde: false, nakshatra: "Uttara Phalguni" },
    { name: "Mars", sign: "Scorpio", degree: 2.7, house: 1, retrograde: false, nakshatra: "Vishakha" },
    { name: "Jupiter", sign: "Pisces", degree: 17.0, house: 5, retrograde: false, nakshatra: "Revati" },
    { name: "Saturn", sign: "Aquarius", degree: 11.6, house: 4, retrograde: true, nakshatra: "Shatabhisha" },
    { name: "Rahu", sign: "Taurus", degree: 19.3, house: 7, retrograde: false, nakshatra: "Mrigashira" },
    { name: "Ketu", sign: "Scorpio", degree: 19.3, house: 1, retrograde: false, nakshatra: "Jyeshtha" },
  ],
  dasha: {
    mahadasha: "Venus", mahadashaStart: "2012-04-01", mahadashaEnd: "2032-04-01",
    antardasha: "Mercury", antardashaStart: "2025-02-01", antardashaEnd: "2027-12-01",
  },
};

const input: KundliInput = {
  name: "Shiv Vyas",
  birthDate: "1994-09-12",
  birthTime: "04:35",
  place: "Ahmedabad, Gujarat, India",
  timezone: "Asia/Kolkata",
  chart,
  numerology: { mulank: 3, bhagyank: 8, namank: 5 },
};

describe("generateKundliPdf", () => {
  it("produces a two-page document", async () => {
    const bytes = await generateKundliPdf(input);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toContain("Shiv Vyas");
  });

  /**
   * The standard PDF fonts are WinAnsi-encoded and pdf-lib throws on any
   * character outside it rather than substituting one — so a stray ℞ or a
   * superscript r does not degrade, it 500s the download route. Every string
   * the generator can emit is exercised here.
   */
  it("never emits a character the standard fonts cannot encode", async () => {
    await expect(generateKundliPdf(input)).resolves.toBeDefined();

    // Every retrograde, every house occupied, and a name with an accent in it.
    const crowded: KundliInput = {
      ...input,
      name: "Renée Ó Súilleabháin",
      chart: {
        ...chart,
        planets: chart.planets.map((p, i) => ({ ...p, retrograde: true, house: (i % 12) + 1 })),
      },
    };
    await expect(generateKundliPdf(crowded)).resolves.toBeDefined();
  });

  it("survives a chart with no dasha and no ayanamsa", async () => {
    const bare: KundliInput = {
      ...input,
      chart: { ...chart, dasha: undefined, ayanamsa: undefined },
    };
    const doc = await PDFDocument.load(await generateKundliPdf(bare));
    expect(doc.getPageCount()).toBe(2);
  });

  /**
   * A bare `yyyy-MM-dd` parsed as UTC midnight and formatted in a local zone
   * west of Greenwich comes back as the day before. Someone's birthday is not a
   * field that may drift with where the server happens to run, and Vercel's
   * functions do not all run in the same place.
   */
  it("renders dates in UTC wherever the server is", () => {
    for (const zone of ["America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati", "UTC"]) {
      const original = process.env.TZ;
      try {
        process.env.TZ = zone;
        expect(prettyDate("1994-09-12"), zone).toBe("12 September 1994");
        expect(shortDate("2032-04-01"), zone).toBe("Apr 2032");
        // The two dates either side of a UTC day boundary.
        expect(prettyDate("2025-01-01"), zone).toBe("1 January 2025");
        expect(prettyDate("2024-12-31"), zone).toBe("31 December 2024");
      } finally {
        process.env.TZ = original;
      }
    }
  });

  it("passes a malformed date through rather than printing Invalid Date", () => {
    expect(prettyDate("not-a-date")).toBe("not-a-date");
    expect(shortDate("")).toBe("");
  });
});
