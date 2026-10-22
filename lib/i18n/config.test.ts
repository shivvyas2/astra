import { describe, it, expect } from "vitest";
import { intlLocale, languageForLocale, localeForLanguage, localeFromAcceptLanguage, resolveLocale } from "./config";
import { format } from "./core";

describe("resolveLocale", () => {
  it("puts the stored language first", () => {
    expect(resolveLocale({ stored: "gujarati", cookie: "hi", acceptLanguage: "hi" })).toBe("gu");
    expect(resolveLocale({ stored: "english", cookie: "gu", acceptLanguage: "gu" })).toBe("en");
  });

  it("reads Sanskrit terms as English for the site", () => {
    expect(resolveLocale({ stored: "sanskrit", cookie: "hi" })).toBe("en");
  });

  it("uses the cookie when nothing is stored", () => {
    expect(resolveLocale({ stored: null, cookie: "hi", acceptLanguage: "gu" })).toBe("hi");
  });

  it("ignores a cookie it does not know", () => {
    expect(resolveLocale({ cookie: "fr", acceptLanguage: "gu-IN" })).toBe("gu");
  });

  it("falls back to Accept-Language, then English", () => {
    expect(resolveLocale({ acceptLanguage: "hi-IN,hi;q=0.9,en;q=0.8" })).toBe("hi");
    expect(resolveLocale({ acceptLanguage: "fr-FR,de;q=0.5" })).toBe("en");
    expect(resolveLocale({})).toBe("en");
  });
});

describe("localeFromAcceptLanguage", () => {
  it("takes the supported language the browser ranks highest", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,hi;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("fr;q=1,gu;q=0.7,hi;q=0.6")).toBe("gu");
    expect(localeFromAcceptLanguage("hi;q=0.4, gu;q=0.9")).toBe("gu");
  });

  it("skips refusals and junk", () => {
    expect(localeFromAcceptLanguage("hi;q=0,de")).toBeNull();
    expect(localeFromAcceptLanguage("*")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
});

describe("language and locale", () => {
  it("map one to the other", () => {
    expect(localeForLanguage("hindi")).toBe("hi");
    expect(localeForLanguage("gujarati")).toBe("gu");
    expect(localeForLanguage("english")).toBe("en");
    expect(languageForLocale("gu")).toBe("gujarati");
    expect(languageForLocale("en")).toBe("english");
  });

  it("formats dates with Western digits", () => {
    const d = new Date("2026-11-03T12:00:00Z");
    for (const locale of ["hi", "gu"] as const) {
      const text = d.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
      expect(text).toContain("2026");
      expect(text).toMatch(/\b3\b/);
    }
  });
});

describe("format", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(format("en", "Hello, {name} {x}", { name: "Asha" })).toBe("Hello, Asha {x}");
  });

  it("picks the plural form by count", () => {
    const p = { one: "{count} day", other: "{count} days" };
    expect(format("en", p, { count: 1 })).toBe("1 day");
    expect(format("en", p, { count: 3 })).toBe("3 days");
  });
});
