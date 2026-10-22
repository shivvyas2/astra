import type { Metadata } from "next";
import { Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import "./globals.css";

// Readings can be in Gujarati or Hindi. Apple devices draw those scripts in
// SF, as the app does; elsewhere these fill in, at the same weights, so the
// text looks the same on Windows and Android. Each only loads for its own
// script's characters.
const gujarati = Noto_Sans_Gujarati({ subsets: ["gujarati"], weight: ["400", "500", "600"], variable: "--font-gujarati", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-devanagari", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.title, description: t.meta.description };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // One language for the whole request (lib/i18n/server.ts); client
  // components read the same dictionary through the provider.
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} className={`${gujarati.variable} ${devanagari.variable}`}>
      <body className="min-h-screen antialiased">
        <I18nProvider locale={locale} messages={t}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
