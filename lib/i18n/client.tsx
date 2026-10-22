"use client";
import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { createI18n, type I18n } from "./core";
import type { Messages } from "./en";

const I18nContext = createContext<I18n | null>(null);

/**
 * Holds the request's dictionary for client components. The root layout
 * renders it with the one dictionary getLocale picked; a language change
 * refreshes the router, which renders it again with the new one.
 */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => createI18n(locale, messages), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const { t, f } = useI18n()` in a client component. */
export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n outside I18nProvider");
  return value;
}
