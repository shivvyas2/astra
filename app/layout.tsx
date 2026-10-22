import type { Metadata } from "next";
import { Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import "./globals.css";

// Readings can be in Gujarati or Hindi. Apple devices draw those scripts in
// SF, as the app does; elsewhere these fill in, at the same weights, so the
// text looks the same on Windows and Android. Each only loads for its own
// script's characters.
const gujarati = Noto_Sans_Gujarati({ subsets: ["gujarati"], weight: ["400", "500", "600"], variable: "--font-gujarati", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-devanagari", display: "swap" });

export const metadata: Metadata = {
  title: "Astrya: Your chart, read by the stars",
  description: "Sign up, share your birth details, and chat with an astrologer powered by your real birth chart.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${gujarati.variable} ${devanagari.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
