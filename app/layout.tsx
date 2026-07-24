import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Astra — Your chart, read by the stars",
  description: "Sign up, share your birth details, and chat with an astrologer powered by your real birth chart.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
