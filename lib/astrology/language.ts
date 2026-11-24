/**
 * The language a person's readings are written in. Chosen in the app or on
 * the web, stored on birth_profiles.reading_language (migration 0017), and
 * read by every prompt that writes for a person: Ask, the morning and
 * evening readings, alerts, discoveries and the life map.
 *
 * "sanskrit" is English prose with the Sanskrit terms (Surya, Mesha, bhava)
 * rather than Sanskrit prose: almost nobody reads a reading in Sanskrit.
 */
export const READING_LANGUAGES = ["english", "hindi", "gujarati", "sanskrit"] as const;
export type ReadingLanguage = (typeof READING_LANGUAGES)[number];

export function isReadingLanguage(value: unknown): value is ReadingLanguage {
  return typeof value === "string" && (READING_LANGUAGES as readonly string[]).includes(value);
}

/** Each option as it is shown, in its own script. */
export const LANGUAGE_LABEL: Record<ReadingLanguage, string> = {
  english: "English",
  hindi: "हिन्दी",
  gujarati: "ગુજરાતી",
  sanskrit: "Sanskrit terms",
};

/**
 * The reading's two structural headings in each language. The reader splits a
 * reading on them (splitReading here, MarkdownBlock on iOS), so every title
 * listed here is recognised whatever language the reading came back in.
 */
export const SIMPLE_TITLE: Record<ReadingLanguage, string> = {
  english: "In simple words",
  hindi: "सरल शब्दों में",
  gujarati: "સરળ શબ્દોમાં",
  sanskrit: "In simple words",
};

export const BASIS_TITLE: Record<ReadingLanguage, string> = {
  english: "Chart basis",
  hindi: "कुंडली का आधार",
  gujarati: "કુંડળીનો આધાર",
  sanskrit: "Chart basis",
};

/**
 * The instruction appended to a prompt, or "" for English. `structured` is
 * for replies in a fixed shape (TITLE:, BODY:, DETAIL:), whose labels the
 * parser reads and must stay in English.
 */
export function languageRule(language: ReadingLanguage, opts: { structured?: boolean } = {}): string {
  const keepLabels = opts.structured
    ? " Keep the labels of the reply shape (TITLE:, BODY:, DETAIL:, and any like them) exactly as written in English; only what follows them changes language."
    : "";
  switch (language) {
    case "english":
      return "";
    case "sanskrit":
      return `\n\nLANGUAGE\nWrite in plain English, but use the Sanskrit names throughout: grahas (Surya, Chandra, Mangal, Budh, Guru, Shukra, Shani, Rahu, Ketu), rashis (Mesha, Vrishabha, Mithuna, Karka, Simha, Kanya, Tula, Vrishchika, Dhanu, Makara, Kumbha, Meena), bhava for house, lagna for ascendant, dasha and antardasha. Give the English word in brackets the first time each appears.${keepLabels}`;
    case "hindi":
      return `\n\nLANGUAGE\nWrite everything in Hindi, in Devanagari script, in simple everyday Hindi rather than formal or Sanskritised Hindi. Planet, sign and house names in their Hindi forms (सूर्य, चंद्र, मेष, भाव). Dates as day, month name in Hindi, year in digits. Title the closing section **${SIMPLE_TITLE.hindi}** instead of **In simple words**, and the facts section **${BASIS_TITLE.hindi}** instead of **Chart basis**, with its facts translated.${keepLabels}`;
    case "gujarati":
      return `\n\nLANGUAGE\nWrite everything in Gujarati, in Gujarati script, in simple everyday Gujarati. Planet, sign and house names in their Gujarati forms (સૂર્ય, ચંદ્ર, મેષ, ભાવ). Dates as day, month name in Gujarati, year in digits. Title the closing section **${SIMPLE_TITLE.gujarati}** instead of **In simple words**, and the facts section **${BASIS_TITLE.gujarati}** instead of **Chart basis**, with its facts translated.${keepLabels}`;
  }
}

/**
 * Ask's language rule: the setting, plus following what they actually type.
 * Someone who set nothing and writes Hinglish gets Hinglish back. Someone who
 * chose Hindi or Gujarati keeps it when they type in English, since an English
 * keyboard is not a request for English.
 */
export function chatLanguageRule(language: ReadingLanguage): string {
  const chosen = language === "hindi" || language === "gujarati";
  return (
    languageRule(language) +
    `\n\nLANGUAGE OF THEIR MESSAGE
English, Hindi, Gujarati, and Hindi or Gujarati typed in English letters (Hinglish, Gujlish) are all welcome; never ask them to switch. Write the whole answer in the language and script of their newest message${
      chosen ? ", except that a message in plain English is answered in the language set above" : ""
    }. When that message is too short to tell (a name, a date, "ok"), keep the language you were already using. Section titles: **${SIMPLE_TITLE.english}** and **${BASIS_TITLE.english}** for anything in English letters, **${SIMPLE_TITLE.hindi}** and **${BASIS_TITLE.hindi}** for Hindi, **${SIMPLE_TITLE.gujarati}** and **${BASIS_TITLE.gujarati}** for Gujarati.`
  );
}

type LanguageDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * One user's reading language, or English when unset, unknown, or before
 * migration 0017 (the read fails and is ignored).
 */
export async function loadReadingLanguage(db: LanguageDb): Promise<ReadingLanguage> {
  try {
    const { data, error } = await db.from("birth_profiles").select("reading_language").maybeSingle();
    if (error) return "english";
    const value = (data as { reading_language?: unknown } | null)?.reading_language;
    return isReadingLanguage(value) ? value : "english";
  } catch {
    return "english";
  }
}

/** Every user's reading language, for the jobs. Empty before migration 0017. */
export async function loadReadingLanguages(db: LanguageDb): Promise<Map<string, ReadingLanguage>> {
  const out = new Map<string, ReadingLanguage>();
  try {
    const { data, error } = await db.from("birth_profiles").select("user_id, reading_language").neq("reading_language", "english");
    if (error) return out;
    for (const row of (data ?? []) as { user_id: string; reading_language: unknown }[]) {
      if (isReadingLanguage(row.reading_language)) out.set(row.user_id, row.reading_language);
    }
  } catch {
    // Before the migration: everyone reads in English.
  }
  return out;
}
