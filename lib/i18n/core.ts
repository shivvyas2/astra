import type { Messages } from "./en";
import { intlLocale, type Locale } from "./config";

/**
 * The small i18n layer: typed dictionaries (en.ts is the source of keys; hi
 * and gu are typed against it, so a missing key fails tsc), `{name}`
 * interpolation, and `{ one, other }` plurals chosen by Intl.PluralRules.
 *
 * Client-safe and dictionary-free: the server picks one dictionary per
 * request and hands it to the client provider, so a page never ships all
 * three.
 */

/** A string that changes with a count; `{count}` is filled in like any other value. */
export type Plural = { one: string; other: string };
export type Params = Record<string, string | number>;

/** Every leaf as a plain string, so hi and gu can hold their own words. */
export type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T;

export function isPlural(value: unknown): value is Plural {
  return typeof value === "object" && value !== null && "one" in value && "other" in value;
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
function pluralFor(locale: Locale, count: number): keyof Plural {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(count) === "one" ? "one" : "other";
}

/** Fills `{name}` from `params`; a plural picks its form from `params.count`. */
export function format(locale: Locale, template: string | Plural, params: Params = {}): string {
  const text = isPlural(template) ? template[pluralFor(locale, Number(params.count ?? 0))] : template;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

export type I18n = {
  locale: Locale;
  t: Messages;
  /** `f(t.chat.askAbout, { name })`. */
  f: (template: string | Plural, params?: Params) => string;
  /** A date in the active language, Western digits. `english` is the tag used for English. */
  date: (value: Date | string, options: Intl.DateTimeFormatOptions, english?: string) => string;
  /** "A, B and C" in the active language. */
  list: (items: string[]) => string;
};

export function createI18n(locale: Locale, t: Messages): I18n {
  return {
    locale,
    t,
    f: (template, params) => format(locale, template, params),
    date: (value, options, english) => {
      const d = typeof value === "string" ? new Date(value) : value;
      return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(intlLocale(locale, english), options);
    },
    list: (items) => new Intl.ListFormat(intlLocale(locale), { style: "long", type: "conjunction" }).format(items),
  };
}
