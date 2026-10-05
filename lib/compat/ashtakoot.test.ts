import { describe, it, expect } from "vitest";
import { NAKSHATRAS } from "@/lib/astrology/constants";
import type { Chart } from "@/lib/astrology/types";
import {
  computeAshtakoot,
  gunaVerdict,
  maitriPoints,
  mangalDosha,
  mangalNote,
  padaOf,
  vashyaOf,
  type KootaKey,
  type MoonPoint,
} from "./ashtakoot";

const scores = (r: ReturnType<typeof computeAshtakoot>) =>
  Object.fromEntries(r.kootas.map((k) => [k.key, k.score])) as Record<KootaKey, number>;

describe("published reference matchings", () => {
  // Source: Divine API, Ashtakoot Milan sample response
  // (https://developers.divineapi.com/divine-api/indian-api/match-making-api/ashtakoot-milan).
  // Both people born 24-05-1998 14:40:43, New Delhi — so identical Moons
  // (Bharani, Aries). Published: Varna 1, Vashya 2, Tara 3, Yoni 4 (Gaja),
  // Maitri 5 (Mars), Gana 6 (Manushya), Bhakoot 7, Nadi 0 (Madhya) = 28,
  // with Nadi dosha.
  it("identical Moons (Bharani in Aries) score 28 with Nadi dosha — Divine API sample", () => {
    const moon: MoonPoint = { sign: "Aries", nakshatra: "Bharani", degree: 20 };
    const r = computeAshtakoot({ groom: moon, bride: moon });
    expect(scores(r)).toEqual({ varna: 1, vashya: 2, tara: 3, yoni: 4, maitri: 5, gana: 6, bhakoot: 7, nadi: 0 });
    expect(r.total).toBe(28);
    expect(r.kootas.find((k) => k.key === "yoni")!.groom).toBe("Elephant");
    expect(r.kootas.find((k) => k.key === "gana")!.groom).toBe("Manushya");
    expect(r.kootas.find((k) => k.key === "nadi")!.groom).toBe("Madhya");
    expect(r.doshas.map((d) => d.kind)).toEqual(["nadi"]);
  });

  // Source: Nitya Panchangam, Ashwini & Bharani compatibility
  // (https://nityapanchangam.com/compatibility/ashwini/bharani/). Boy Ashwini,
  // girl Bharani, both in Mesha. Published: Varna 1 (Kshatriya × Kshatriya),
  // Vashya 2 (Chatushpada × Chatushpada), Tara 1.5, Yoni 2 (Ashwa × Gaja),
  // Graha Maitri 5 (Mars × Mars), Gana 5 (Deva × Manushya), Bhakoot 7,
  // Nadi 8 (Adi × Madhya) = 32.
  //
  // Seven of the eight agree with these tables exactly. Tara does not: the
  // two-way count is Bharani→Ashwini = 27 (27 mod 9 = 0, Ati-Mitra) and
  // Ashwini→Bharani = 2 (Sampat), both kind, so the rule this module follows
  // (and the site's own description of it) gives 3, not 1.5. Their parts sum
  // to 31.5, shown rounded as 32; with Tara at 3 the same parts make 33.
  it("Ashwini (groom) × Bharani (bride) matches Nitya Panchangam on every koota but Tara", () => {
    const r = computeAshtakoot({
      groom: { sign: "Aries", nakshatra: "Ashwini", degree: 5 },
      bride: { sign: "Aries", nakshatra: "Bharani", degree: 20 },
    });
    const s = scores(r);
    expect({ ...s, tara: undefined }).toEqual({
      varna: 1, vashya: 2, tara: undefined, yoni: 2, maitri: 5, gana: 5, bhakoot: 7, nadi: 8,
    });
    expect(s.tara).toBe(3);
    expect(r.total).toBe(33);
    expect(r.doshas).toEqual([]);
  });
});

describe("a fully worked pair", () => {
  // Groom: Magha, Leo 5°. Bride: Swati, Libra 10°.
  //  Varna   Leo Kshatriya ≥ Libra Shudra                        → 1
  //  Vashya  bride Manava row, groom Vanachara column             → 0
  //  Tara    Swati→Magha = 23 (mod 9 = 5, Pratyari) 0; Magha→Swati = 6 (Sadhaka) 1.5 → 1.5
  //  Yoni    Rat × Buffalo                                        → 2
  //  Maitri  Sun × Venus, mutual enemies                          → 0
  //  Gana    bride Deva row, groom Rakshasa column                → 0
  //  Bhakoot Leo → Libra is 3/11                                  → 7
  //  Nadi    Magha and Swati are both Antya                       → 0
  const groom: MoonPoint = { sign: "Leo", nakshatra: "Magha", degree: 5 };
  const bride: MoonPoint = { sign: "Libra", nakshatra: "Swati", degree: 10 };

  it("scores 11.5 with Nadi dosha and no exception", () => {
    const r = computeAshtakoot({ groom, bride });
    expect(scores(r)).toEqual({ varna: 1, vashya: 0, tara: 1.5, yoni: 2, maitri: 0, gana: 0, bhakoot: 7, nadi: 0 });
    expect(r.total).toBe(11.5);
    const nadi = r.doshas.find((d) => d.kind === "nadi")!;
    expect(nadi.exceptions).toEqual([]);
    expect(gunaVerdict(r.total)).toMatch(/below the traditional 18/i);
  });

  it("reads the asymmetric kootas the other way when the roles swap", () => {
    const r = computeAshtakoot({ groom: bride, bride: groom });
    // Varna: Shudra groom below a Kshatriya bride → 0. Gana: Rakshasa bride,
    // Deva groom → 1. Vashya: Vanachara bride, Manava groom → 0.
    expect(scores(r)).toMatchObject({ varna: 0, vashya: 0, gana: 1, tara: 1.5, yoni: 2, maitri: 0, bhakoot: 7, nadi: 0 });
    expect(r.total).toBe(11.5);
  });
});

describe("tables", () => {
  // The printed 7×7 Graha Maitri table (Sun, Moon, Mars, Mercury, Jupiter,
  // Venus, Saturn), as reproduced across North Indian panchangas.
  const LORDS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
  const PRINTED = [
    [5, 5, 5, 4, 5, 0, 0],
    [5, 5, 4, 1, 4, 0.5, 0.5],
    [5, 4, 5, 0.5, 5, 3, 0.5],
    [4, 1, 0.5, 5, 0.5, 5, 4],
    [5, 4, 5, 0.5, 5, 0.5, 3],
    [0, 0.5, 3, 5, 0.5, 5, 5],
    [0, 0.5, 0.5, 4, 3, 5, 5],
  ];
  it("Graha Maitri from natural friendships reproduces the printed table cell for cell", () => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        expect(maitriPoints(LORDS[i], LORDS[j]), `${LORDS[i]} × ${LORDS[j]}`).toBe(PRINTED[i][j]);
      }
    }
  });

  it("Nadi groups follow the classical lists", () => {
    const adi = ["Ashwini", "Ardra", "Punarvasu", "Uttara Phalguni", "Hasta", "Jyeshtha", "Mula", "Shatabhisha", "Purva Bhadrapada"];
    const madhya = ["Bharani", "Mrigashira", "Pushya", "Purva Phalguni", "Chitra", "Anuradha", "Purva Ashadha", "Dhanishta", "Uttara Bhadrapada"];
    const nadiOf = (nak: string) =>
      computeAshtakoot({ groom: { sign: "Aries", nakshatra: nak }, bride: { sign: "Aries", nakshatra: "Ashwini" } }).kootas.find(
        (k) => k.key === "nadi",
      )!.groom;
    for (const n of adi) expect(nadiOf(n), n).toBe("Adi");
    for (const n of madhya) expect(nadiOf(n), n).toBe("Madhya");
    const antya = NAKSHATRAS.filter((n) => !adi.includes(n) && !madhya.includes(n));
    expect(antya).toHaveLength(9);
    for (const n of antya) expect(nadiOf(n), n).toBe("Antya");
  });

  it("sworn-enemy yonis score 0 and the same yoni 4", () => {
    const yoni = (a: string, b: string) =>
      computeAshtakoot({ groom: { sign: "Aries", nakshatra: a }, bride: { sign: "Aries", nakshatra: b } }).kootas.find(
        (k) => k.key === "yoni",
      )!.score;
    expect(yoni("Ashwini", "Hasta")).toBe(0); // horse × buffalo
    expect(yoni("Bharani", "Dhanishta")).toBe(0); // elephant × lion
    expect(yoni("Krittika", "Shravana")).toBe(0); // sheep × monkey
    expect(yoni("Rohini", "Uttara Ashadha")).toBe(0); // serpent × mongoose
    expect(yoni("Ardra", "Anuradha")).toBe(0); // dog × deer
    expect(yoni("Punarvasu", "Magha")).toBe(0); // cat × rat
    expect(yoni("Uttara Phalguni", "Chitra")).toBe(0); // cow × tiger
    expect(yoni("Ashwini", "Shatabhisha")).toBe(4); // both horse
  });

  it("Gana follows onlinejyotish's bride-row table", () => {
    const gana = (groomNak: string, brideNak: string) =>
      computeAshtakoot({ groom: { sign: "Aries", nakshatra: groomNak }, bride: { sign: "Aries", nakshatra: brideNak } }).kootas.find(
        (k) => k.key === "gana",
      )!.score;
    // Ashwini Deva, Bharani Manushya, Krittika Rakshasa.
    expect(gana("Ashwini", "Bharani")).toBe(5); // Manushya bride, Deva groom
    expect(gana("Bharani", "Ashwini")).toBe(6); // Deva bride, Manushya groom
    expect(gana("Krittika", "Ashwini")).toBe(0); // Deva bride, Rakshasa groom
    expect(gana("Ashwini", "Krittika")).toBe(1); // Rakshasa bride, Deva groom
    expect(gana("Krittika", "Bharani")).toBe(0);
  });

  it("splits Sagittarius and Capricorn at 15° for Vashya", () => {
    expect(vashyaOf({ sign: "Sagittarius", nakshatra: "Mula", degree: 4 })).toBe("Manava");
    expect(vashyaOf({ sign: "Sagittarius", nakshatra: "Uttara Ashadha", degree: 28 })).toBe("Chatushpada");
    expect(vashyaOf({ sign: "Capricorn", nakshatra: "Uttara Ashadha", degree: 5 })).toBe("Chatushpada");
    expect(vashyaOf({ sign: "Capricorn", nakshatra: "Dhanishta", degree: 25 })).toBe("Jalachara");
    expect(vashyaOf({ sign: "Leo", nakshatra: "Magha" })).toBe("Vanachara");
    expect(vashyaOf({ sign: "Scorpio", nakshatra: "Jyeshtha" })).toBe("Keeta");
  });

  it("Tara counts both ways and zeroes Vipat, Pratyari and Vadha", () => {
    const tara = (g: string, b: string) =>
      computeAshtakoot({ groom: { sign: "Aries", nakshatra: g }, bride: { sign: "Aries", nakshatra: b } }).kootas.find(
        (k) => k.key === "tara",
      )!.score;
    // Ashwini→Krittika = 3 (Vipat) 0; Krittika→Ashwini = 26 (mod 9 = 8, Mitra) 1.5.
    expect(tara("Ashwini", "Krittika")).toBe(1.5);
    // Ashwini→Rohini = 4 (Kshema); Rohini→Ashwini = 25 (mod 9 = 7, Vadha).
    expect(tara("Ashwini", "Rohini")).toBe(1.5);
    // Ashwini→Pushya = 8 (Mitra); Pushya→Ashwini = 21 (mod 9 = 3, Vipat).
    expect(tara("Ashwini", "Pushya")).toBe(1.5);
    // Ashwini→Bharani = 2; Bharani→Ashwini = 27 (Ati-Mitra).
    expect(tara("Ashwini", "Bharani")).toBe(3);
  });

  it("Bhakoot zeroes 2/12, 5/9 and 6/8 only", () => {
    const bhakoot = (g: string, b: string) =>
      computeAshtakoot({ groom: { sign: g, nakshatra: "Ashwini" }, bride: { sign: b, nakshatra: "Bharani" } }).kootas.find(
        (k) => k.key === "bhakoot",
      )!.score;
    expect(bhakoot("Aries", "Taurus")).toBe(0); // 2/12
    expect(bhakoot("Aries", "Leo")).toBe(0); // 5/9
    expect(bhakoot("Aries", "Virgo")).toBe(0); // 6/8
    expect(bhakoot("Aries", "Gemini")).toBe(7); // 3/11
    expect(bhakoot("Aries", "Cancer")).toBe(7); // 4/10
    expect(bhakoot("Aries", "Libra")).toBe(7); // 7/7
  });
});

describe("doshas are notes, never silent overrides", () => {
  it("names the same-sign exception to Nadi dosha but keeps Nadi at 0", () => {
    // Ardra and Punarvasu are both Adi nadi; both in Gemini.
    const r = computeAshtakoot({
      groom: { sign: "Gemini", nakshatra: "Ardra", degree: 10 },
      bride: { sign: "Gemini", nakshatra: "Punarvasu", degree: 25 },
    });
    expect(scores(r).nadi).toBe(0);
    const nadi = r.doshas.find((d) => d.kind === "nadi")!;
    expect(nadi.exceptions.join(" ")).toMatch(/same moon sign, different nakshatras/i);
    expect(nadi.exceptions.join(" ")).toMatch(/both moon signs ruled by mercury/i);
  });

  it("names the different-pada exception only when both degrees are trusted", () => {
    const groom: MoonPoint = { sign: "Taurus", nakshatra: "Rohini", degree: 11 }; // pada 1
    const bride: MoonPoint = { sign: "Taurus", nakshatra: "Rohini", degree: 22 }; // pada 4
    expect(padaOf(groom)).toBe(1);
    expect(padaOf(bride)).toBe(4);
    const trusted = computeAshtakoot({ groom, bride }).doshas.find((d) => d.kind === "nadi")!;
    expect(trusted.exceptions.join(" ")).toMatch(/different padas/i);
    const guessed = computeAshtakoot({ groom, bride: { ...bride, degreeKnown: false } }).doshas.find((d) => d.kind === "nadi")!;
    expect(guessed.exceptions.join(" ")).not.toMatch(/padas/i);
  });

  it("flags Bhakoot dosha with the same-lord exception (Aries/Scorpio, 6/8, both Mars)", () => {
    const r = computeAshtakoot({
      groom: { sign: "Aries", nakshatra: "Ashwini" },
      bride: { sign: "Scorpio", nakshatra: "Anuradha" },
    });
    expect(scores(r).bhakoot).toBe(0);
    const b = r.doshas.find((d) => d.kind === "bhakoot")!;
    expect(b.present).toBe(true);
    expect(b.exceptions.join(" ")).toMatch(/both moon signs ruled by mars/i);
  });
});

describe("Mangal dosha", () => {
  const base = (over: Partial<Chart>, marsSign: string, moonSign: string): Chart => ({
    tradition: "vedic",
    ascendant: { sign: "Aries", degree: 10 },
    houses: [],
    planets: [
      { name: "Moon", sign: moonSign, degree: 10, house: 0, retrograde: false, nakshatra: "Ashwini" },
      { name: "Mars", sign: marsSign, degree: 10, house: 0, retrograde: false },
    ],
    moonSign,
    sunSign: "Aries",
    ...over,
  });

  it("checks from the lagna and from the Moon", () => {
    // Mars in Libra: 7th from an Aries lagna; 3rd from a Leo Moon.
    const m = mangalDosha(base({}, "Libra", "Leo"));
    expect(m).toEqual({ fromLagna: true, fromMoon: false, present: true });
  });

  it("skips the lagna when the birth time is unknown", () => {
    const m = mangalDosha(base({ timeKnown: false }, "Libra", "Leo"));
    expect(m).toEqual({ fromLagna: null, fromMoon: false, present: false });
    const note = mangalNote(m, mangalDosha(base({}, "Gemini", "Gemini")), { a: "You", b: "Priya" });
    expect(note.note).toMatch(/only the moon was checked for you/i);
  });

  it("notes the mutual cancellation when both carry it", () => {
    const a = mangalDosha(base({}, "Libra", "Leo"));
    const b = mangalDosha(base({}, "Aries", "Aries"));
    const note = mangalNote(a, b, { a: "You", b: "Priya" });
    expect(note.present).toBe(true);
    expect(note.exceptions.join(" ")).toMatch(/cancelling/i);
  });
});
