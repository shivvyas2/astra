import type { Locale } from "./config";
import { createI18n, type I18n } from "./core";
import { en, type Messages } from "./en";
import { gu } from "./gu";
import { hi } from "./hi";
import { legalEn, type LegalMessages } from "./legal/en";
import { legalGu } from "./legal/gu";
import { legalHi } from "./legal/hi";

/**
 * All three dictionaries, for the server and tests. Client components never
 * import this: they get the one dictionary the request needs through
 * I18nProvider.
 */
export const DICTIONARIES: Record<Locale, Messages> = { en, hi, gu };
export const LEGAL: Record<Locale, LegalMessages> = { en: legalEn, hi: legalHi, gu: legalGu };

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale];
}

/** An I18n for a known locale, as a route handler or a job builds it. */
export function i18nFor(locale: Locale): I18n {
  return createI18n(locale, DICTIONARIES[locale]);
}
