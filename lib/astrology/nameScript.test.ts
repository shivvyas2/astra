import { describe, expect, it } from "vitest";
import { gu } from "@/lib/i18n/gu";
import { hi } from "@/lib/i18n/hi";
import { GRAHA_SANSKRIT, RASHI_SANSKRIT } from "@/lib/profiles/names";
import { isNameScript, NAME_SCRIPTS, planetIn, planetShortIn, signIn, signsIn, scriptForLanguage } from "./nameScript";

const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];

describe("chart names", () => {
  it("are complete and never the same twice, in every script", () => {
    for (const s of NAME_SCRIPTS) {
      expect(new Set(PLANETS.map((p) => planetIn(s, p))).size).toBe(9);
      expect(new Set(PLANETS.map((p) => planetShortIn(s, p))).size).toBe(9);
      expect(new Set(signsIn(s)).size).toBe(12);
    }
  });
  it("are the names the rest of the site uses", () => {
    for (const p of PLANETS) {
      expect(planetIn("hindi", p)).toBe((hi.names.planets as Record<string, string>)[p]);
      expect(planetIn("gujarati", p)).toBe((gu.names.planets as Record<string, string>)[p]);
      expect(planetIn("sanskrit", p)).toBe(GRAHA_SANSKRIT[p]);
    }
    for (const s of signsIn("english")) {
      expect(signIn("hindi", s)).toBe((hi.names.signs as Record<string, string>)[s]);
      expect(signIn("gujarati", s)).toBe((gu.names.signs as Record<string, string>)[s]);
      expect(signIn("sanskrit", s)).toBe(RASHI_SANSKRIT[s]);
    }
  });
  it("follow the language until chosen, and leave unknown names alone", () => {
    expect(scriptForLanguage("sanskrit")).toBe("sanskrit");
    expect(planetIn("hindi", "Pluto")).toBe("Pluto");
    expect(isNameScript("klingon")).toBe(false);
  });
});
