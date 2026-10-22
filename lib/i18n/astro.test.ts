import { describe, it, expect, beforeAll } from "vitest";
import { personalTiming } from "@/lib/timing/engine";
import type { SkyEvent } from "@/lib/timing/sky";
import type { Chart } from "@/lib/astrology/types";
import { computeChartPair } from "@/lib/data/birthProfile";
import { computeCompatibility, type ChartPair } from "@/lib/compat/compatibility";
import { i18nFor } from "./dictionaries";
import { compatAskPrompt, compatSummary, doshaText, kootaNote, timingText } from "./astro";

const DEVANAGARI = /[ऀ-ॿ]/;
const GUJARATI = /[઀-૿]/;
const LATIN_WORD = /\b(Jupiter|Saturn|Rahu|Leo|Cancer|Capricorn|house|Moon)\b/;

const natal = {
  tradition: "vedic",
  ascendant: { sign: "Pisces", degree: 10 },
  houses: [],
  moonSign: "Leo",
  sunSign: "Pisces",
  planets: [
    { name: "Moon", sign: "Leo", degree: 12, house: 6, retrograde: false },
    { name: "Jupiter", sign: "Scorpio", degree: 21, house: 9, retrograde: true },
  ],
} as unknown as Chart;

const sky: SkyEvent[] = [
  { kind: "ingress", date: "2026-10-31", body: "Jupiter", sign: "Leo", from: "Cancer", retrograde: false },
  { kind: "ingress", date: "2026-12-06", body: "Rahu", sign: "Capricorn", from: "Aquarius", retrograde: true },
  { kind: "ingress", date: "2026-12-06", body: "Ketu", sign: "Cancer", from: "Leo", retrograde: true },
  { kind: "station", date: "2026-12-13", body: "Jupiter", sign: "Leo", retrograde: true },
  { kind: "ingress", date: "2027-01-25", body: "Jupiter", sign: "Cancer", from: "Leo", retrograde: true },
];

const events = personalTiming({ natal, sky, today: "2026-10-09", horizonEnd: "2027-10-09" });

describe("timingText", () => {
  it("shows the engine's own English sentence in English", () => {
    for (const e of events) expect(timingText(i18nFor("en"), e)).toEqual({ title: e.title, detail: e.detail });
  });

  it("says every key date in Hindi and Gujarati, with no English left", () => {
    for (const [locale, script] of [["hi", DEVANAGARI], ["gu", GUJARATI]] as const) {
      for (const e of events) {
        const { title, detail } = timingText(i18nFor(locale), e);
        expect(title).toMatch(script);
        expect(detail).toMatch(script);
        expect(`${title} ${detail}`).not.toMatch(LATIN_WORD);
        expect(`${title} ${detail}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it("reads a Jupiter ingress in Hindi from its facts", () => {
    const jupiter = events.find((e) => e.id === "2026-10-31-Jupiter-ingress")!;
    const { title, detail } = timingText(i18nFor("hi"), jupiter);
    expect(title).toBe("गुरु सिंह में: आपके छठे भाव");
    expect(detail).toContain("चंद्र");
    expect(detail).toContain("2027");
  });

  it("falls back to English for an event stored before it had facts", () => {
    const { facts: _facts, ...old } = events[0];
    void _facts;
    expect(timingText(i18nFor("gu"), old)).toEqual({ title: old.title, detail: old.detail });
  });
});

describe("compatibility in Hindi and Gujarati", () => {
  let you: ChartPair;
  let them: ChartPair;
  beforeAll(async () => {
    you = await computeChartPair({ birthDate: "1990-01-01", birthTime: "12:00", lat: 28.6139, lng: 77.209, timezone: "Asia/Kolkata" });
    them = await computeChartPair({ birthDate: "1992-06-15", birthTime: "08:30", lat: 19.076, lng: 72.8777, timezone: "Asia/Kolkata" });
  });

  it("keeps English exactly as the engine wrote it", () => {
    const r = computeCompatibility({ you: { name: "Asha", chart: you }, them: { name: "Ravi", relationship: "partner", chart: them } });
    const en = i18nFor("en");
    expect(compatSummary(en, r)).toBe(r.summary);
    expect(compatAskPrompt(en, r, "partner")).toBe(r.askPrompt);
    for (const k of r.guna.kootas) expect(kootaNote(en, k, r.guna.kootas)).toBe(k.note);
  });

  it("writes the notes, doshas, summary and question in the reader's script", () => {
    const r = computeCompatibility({ you: { name: "Asha", chart: you }, them: { name: "Ravi", relationship: "partner", chart: them } });
    for (const [locale, script] of [["hi", DEVANAGARI], ["gu", GUJARATI]] as const) {
      const i = i18nFor(locale);
      for (const k of r.guna.kootas) expect(kootaNote(i, k, r.guna.kootas)).toMatch(script);
      for (const d of r.guna.doshas) {
        const text = doshaText(i, d, r.guna.kootas, "Ravi");
        expect(text.note).toMatch(script);
        for (const e of text.exceptions) expect(e).toMatch(script);
      }
      const summary = compatSummary(i, r);
      expect(summary).toMatch(script);
      expect(summary).not.toMatch(/\{\w+\}/);
      const ask = compatAskPrompt(i, r, "partner");
      expect(ask).toContain("Ravi");
      expect(ask).toMatch(script);
    }
  });
});
