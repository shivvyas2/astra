import type { ReadingLanguage } from "./language";

/**
 * The names a chart is drawn with: English (Western), Sanskrit in Latin
 * letters (Vedic), Hindi or Gujarati. Its own setting, so someone can read in
 * English beside a chart in Hindi; until it is chosen it follows the language.
 * Mirrored on iOS by `NameScript`. Client-safe.
 */
export const NAME_SCRIPTS = ["english", "sanskrit", "hindi", "gujarati"] as const;
export type NameScript = (typeof NAME_SCRIPTS)[number];

export function isNameScript(value: unknown): value is NameScript {
  return typeof value === "string" && (NAME_SCRIPTS as readonly string[]).includes(value);
}

export const NAMES_COOKIE = "astrya-names";
export const NAMES_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each option with a taste of it, in its own script. */
export const NAME_SCRIPT_LABEL: Record<NameScript, string> = { english: "English", sanskrit: "Sanskrit", hindi: "हिन्दी", gujarati: "ગુજરાતી" };
export const NAME_SCRIPT_SAMPLE: Record<NameScript, string> = { english: "Sun, Aries", sanskrit: "Surya, Mesha", hindi: "सूर्य, मेष", gujarati: "સૂર્ય, મેષ" };

const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"] as const;
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;

const PLANET_NAMES: Record<NameScript, readonly string[]> = {
  english: PLANETS,
  sanskrit: ["Surya", "Chandra", "Mangala", "Budha", "Guru", "Shukra", "Shani", "Rahu", "Ketu"],
  hindi: ["सूर्य", "चंद्र", "मंगल", "बुध", "गुरु", "शुक्र", "शनि", "राहु", "केतु"],
  gujarati: ["સૂર્ય", "ચંદ્ર", "મંગળ", "બુધ", "ગુરુ", "શુક્ર", "શનિ", "રાહુ", "કેતુ"],
};

/** What is printed inside a house. */
const PLANET_SHORT: Record<NameScript, readonly string[]> = {
  english: ["Su", "Mo", "Ma", "Me", "Ju", "Ve", "Sa", "Ra", "Ke"],
  sanskrit: ["Su", "Ch", "Ma", "Bu", "Gu", "Sk", "Sa", "Ra", "Ke"],
  hindi: ["सू", "चं", "मं", "बु", "गु", "शु", "श", "रा", "के"],
  gujarati: ["સૂ", "ચં", "મં", "બુ", "ગુ", "શુ", "શ", "રા", "કે"],
};

const SIGN_NAMES: Record<NameScript, readonly string[]> = {
  english: SIGNS,
  sanskrit: ["Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"],
  hindi: ["मेष", "वृषभ", "मिथुन", "कर्क", "सिंह", "कन्या", "तुला", "वृश्चिक", "धनु", "मकर", "कुंभ", "मीन"],
  gujarati: ["મેષ", "વૃષભ", "મિથુન", "કર્ક", "સિંહ", "કન્યા", "તુલા", "વૃશ્ચિક", "ધન", "મકર", "કુંભ", "મીન"],
};

const at = (table: readonly string[], list: readonly string[], name: string) => {
  const i = list.indexOf(name);
  return i < 0 ? name : table[i];
};

export const planetIn = (script: NameScript, name: string) => at(PLANET_NAMES[script], PLANETS, name);
export const planetShortIn = (script: NameScript, name: string) => at(PLANET_SHORT[script], PLANETS, name);
export const signIn = (script: NameScript, name: string) => at(SIGN_NAMES[script], SIGNS, name);
export const signsIn = (script: NameScript) => SIGN_NAMES[script];

/** The names that go with a language, until someone chooses otherwise. */
export function scriptForLanguage(language: ReadingLanguage): NameScript {
  return language;
}
