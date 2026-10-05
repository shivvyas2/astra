/** Sanskrit names for the web, matching the iOS NameScript's "Sanskrit" option. */
export const RASHI_SANSKRIT: Record<string, string> = {
  Aries: "Mesha", Taurus: "Vrishabha", Gemini: "Mithuna", Cancer: "Karka", Leo: "Simha", Virgo: "Kanya",
  Libra: "Tula", Scorpio: "Vrishchika", Sagittarius: "Dhanu", Capricorn: "Makara", Aquarius: "Kumbha", Pisces: "Meena",
};

export const GRAHA_SANSKRIT: Record<string, string> = {
  Sun: "Surya", Moon: "Chandra", Mars: "Mangala", Mercury: "Budha", Jupiter: "Guru",
  Venus: "Shukra", Saturn: "Shani", Rahu: "Rahu", Ketu: "Ketu",
};

/** "Vrishabha (Taurus)", or the input unchanged when it is not a sign. */
export function rashiWithEnglish(sign: string): string {
  const s = RASHI_SANSKRIT[sign];
  return s ? `${s} (${sign})` : sign;
}
