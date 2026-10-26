/**
 * Phone sign-in for India and the US: what counts as a mobile number and how
 * to show one back. Mirrors PhoneCountry in the iOS app
 * (mobile/Sanchara/Sources/Features/Auth/PhoneNumber.swift). Codes go out
 * through Twilio Verify, set up as Supabase's phone provider
 * (docs/PHONE_SIGN_IN.md).
 */
export type PhoneCountry = "IN" | "US";

export const PHONE_COUNTRIES: { code: PhoneCountry; flag: string; dial: string }[] = [
  { code: "IN", flag: "🇮🇳", dial: "+91" },
  { code: "US", flag: "🇺🇸", dial: "+1" },
];

const dialOf = (c: PhoneCountry) => (c === "IN" ? "+91" : "+1");

/**
 * The number in E.164 ("+919876543210"), or null when it can't be a mobile in
 * this country. Takes what people type or paste: spaces, dashes, brackets, a
 * leading 0 (India), a leading 1 (US), or the country code itself.
 */
export function toE164(country: PhoneCountry, input: string): string | null {
  let digits = input.replace(/\D/g, "");
  const code = dialOf(country).slice(1);
  if (digits.length === 10 + code.length && digits.startsWith(code)) digits = digits.slice(code.length);
  if (country === "IN" && digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  if (country === "IN" && !/^[6-9]/.test(digits)) return null; // Indian mobiles start 6–9
  if (country === "US" && (/^[01]/.test(digits) || /^[01]/.test(digits.slice(3)))) return null;
  return dialOf(country) + digits;
}

/** "+91 98765 43210", "+1 (415) 555-2671". */
export function displayPhone(e164: string): string {
  const india = e164.match(/^\+91(\d{5})(\d{5})$/);
  if (india) return `+91 ${india[1]} ${india[2]}`;
  const us = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (us) return `+1 (${us[1]}) ${us[2]}-${us[3]}`;
  return e164;
}

/** Whether a stored value is a number this flow could have sent a code to. */
export function isSupportedE164(value: string | undefined): value is string {
  return !!value && (/^\+91[6-9]\d{9}$/.test(value) || /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(value));
}
