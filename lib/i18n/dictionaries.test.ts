import { describe, it, expect } from "vitest";
import { DICTIONARIES, LEGAL } from "./dictionaries";

type Leaf = { path: string; value: string };

/** Every string in a dictionary with its dotted path; arrays index by position. */
function leaves(node: unknown, path = ""): Leaf[] {
  if (typeof node === "string") return [{ path, value: node }];
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  throw new Error(`${path} is not a string`);
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort();

// Empty in English on purpose: the "English governs" line only shows on a translation.
const EMPTY_IN_ENGLISH = new Set(["authoritative"]);

for (const [name, sets] of [
  ["site", DICTIONARIES],
  ["legal", LEGAL],
] as const) {
  describe(`${name} dictionaries`, () => {
    const en = leaves(sets.en);
    for (const locale of ["hi", "gu"] as const) {
      const other = new Map(leaves(sets[locale]).map((l) => [l.path, l.value]));

      it(`${locale} has every English key, and no others`, () => {
        expect([...other.keys()].sort()).toEqual(en.map((l) => l.path).sort());
      });

      it(`${locale} leaves nothing empty`, () => {
        const empty = [...other].filter(([, v]) => v.trim() === "").map(([p]) => p);
        expect(empty).toEqual([]);
      });

      it(`${locale} keeps each sentence's {placeholders} and <links>`, () => {
        for (const { path, value } of en) {
          if (EMPTY_IN_ENGLISH.has(path)) continue;
          const translated = other.get(path) ?? "";
          expect({ path, p: placeholders(translated) }).toEqual({ path, p: placeholders(value) });
          expect({ path, t: tags(translated) }).toEqual({ path, t: tags(value) });
        }
      });
    }

    it("never uses an em dash, in any language", () => {
      for (const locale of ["en", "hi", "gu"] as const) {
        const dashed = leaves(sets[locale]).filter((l) => l.value.includes("—")).map((l) => `${locale}:${l.path}`);
        expect(dashed).toEqual([]);
      }
    });

    it("keeps English filled in, apart from the translation note", () => {
      const empty = en.filter((l) => l.value.trim() === "" && !EMPTY_IN_ENGLISH.has(l.path)).map((l) => l.path);
      expect(empty).toEqual([]);
    });
  });
}

describe("translations are in their own script", () => {
  it("writes Hindi in Devanagari and Gujarati in Gujarati script", () => {
    expect(DICTIONARIES.hi.chat.ask).toMatch(/[ऀ-ॿ]/);
    expect(DICTIONARIES.gu.chat.ask).toMatch(/[઀-૿]/);
    expect(LEGAL.hi.terms.title).toMatch(/[ऀ-ॿ]/);
    expect(LEGAL.gu.privacy.title).toMatch(/[઀-૿]/);
  });

  it("leaves the name Astrya as it is", () => {
    expect(DICTIONARIES.hi.auth.loginTitle).toContain("Astrya");
    expect(DICTIONARIES.gu.auth.loginTitle).toContain("Astrya");
  });

  it("translates the consent notice section for section", () => {
    for (const locale of ["hi", "gu"] as const) {
      expect(DICTIONARIES[locale].consent.sections.map((s) => s.points.length)).toEqual(
        DICTIONARIES.en.consent.sections.map((s) => s.points.length),
      );
    }
  });
});
