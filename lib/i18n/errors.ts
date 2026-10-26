import type { I18n } from "./core";

/**
 * Errors the web forms show, in the reader's language. The server actions
 * put a short code in the query string (or the parser's English message,
 * which the API routes return to the iPhone as is); this turns either into a
 * sentence. A message from Supabase that is not recognised is shown as it
 * came in English, and in Hindi or Gujarati as a general "try again".
 */
export function authErrorMessage(i: I18n, raw: string): string {
  const e = i.t.auth.errors;
  if (raw === "missing") return e.missing;
  if (raw === "password") return e.password;
  if (raw === "rateLimit") return e.rateLimit;
  if (raw === "phoneMissing") return e.phoneMissing;
  if (raw === "phoneInvalid") return e.phoneInvalid;
  if (raw === "phoneUnavailable") return e.phoneUnavailable;
  if (raw === "phoneExpired") return e.phoneExpired;
  if (raw === "codeLength") return e.codeLength;
  if (raw === "codeInvalid") return e.codeInvalid;
  const m = raw.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many")) return i.locale === "en" ? raw : e.rateLimit;
  if (m.includes("password should be")) return i.locale === "en" ? raw : e.weakPassword;
  if (m.includes("invalid format") || m.includes("invalid email") || m.includes("is invalid")) {
    return i.locale === "en" ? raw : e.invalidEmail;
  }
  return i.locale === "en" && raw !== "other" ? raw : e.other;
}

/** A birth-details or person-form error from lib/profiles (birth.ts, store.ts). */
export function birthErrorMessage(i: I18n, raw: string): string {
  const e = i.t.intake.errors;
  if (i.locale === "en") return raw;
  const field = raw.startsWith("Missing required field: ") ? raw.slice("Missing required field: ".length) : null;
  if (field === "first_name") return e.firstName;
  if (field === "last_name") return e.lastName;
  if (field === "birth_date") return e.birthDate;
  if (field === "birth_time") return e.birthTime;
  if (field && ["place_name", "lat", "lng", "timezone"].includes(field)) return e.place;
  if (raw.startsWith("Names must")) return e.nameLength;
  if (raw.startsWith("birth_date")) return e.birthDatePast;
  if (raw.startsWith("birth_time")) return e.birthTime;
  if (raw.startsWith("lat") || raw.startsWith("timezone")) return e.place;
  if (raw.startsWith("label")) return e.label;
  return e.other;
}
