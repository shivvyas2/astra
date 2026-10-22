import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED, PRIVACY_PATH, TERMS_URL } from "@/lib/billing/copy";

export const metadata: Metadata = {
  title: "Terms · Astrya",
  description: "The terms for using Astrya: what it is, what it is not, and what you agree to.",
};

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "What Astrya is",
    points: [
      "Astrya is a free personal project. It works out your birth chart and uses an AI model to write readings from it.",
      "Readings are for entertainment and reflection. Astrology is not a science, and nothing in Astrya predicts the future with certainty.",
    ],
  },
  {
    title: "Not professional advice",
    points: [
      "Nothing in Astrya is medical, mental health, legal, financial or relationship advice. Do not make important decisions on a reading alone.",
      "If you are in crisis or thinking about harming yourself, contact your local emergency number or a crisis line now. Astrya cannot help in an emergency.",
    ],
  },
  {
    title: "AI-written readings",
    points: [
      "Readings are written by an AI model and can be wrong, incomplete or inconsistent, including about your chart. Check anything that matters.",
      "The Privacy page explains what is sent to the model and why.",
    ],
  },
  {
    title: "Your account",
    points: [
      "You must be at least 13 to use Astrya, and old enough in your country to agree to these terms and to the processing described on the Privacy page.",
      "Keep your sign-in details to yourself. You are responsible for what happens under your account.",
      "If you add someone else's birth details, for example to compare charts, only do so with their permission.",
    ],
  },
  {
    title: "Fair use",
    points: [
      "Don't use Astrya to harass anyone, to break the law, or to try to get around its limits, security or safety rules.",
      "Don't overload the service, scrape it, or use it to build a competing dataset.",
      "An account used this way may be suspended or deleted.",
    ],
  },
  {
    title: "Your content",
    points: [
      "What you write and the birth details you enter stay yours. You let Astrya store and process them only to run the app for you.",
      "You can delete them, or your whole account, from Profile at any time.",
    ],
  },
  {
    title: "No guarantees",
    points: [
      "Astrya is provided as it is and as available, without warranties of any kind, to the extent the law allows.",
      "It may change, pause or shut down at any time. Features may come and go.",
      "To the extent the law allows, the developer is not liable for any loss or damage that comes from using Astrya or relying on a reading.",
    ],
  },
  {
    title: "Apple",
    points: [
      "If you got Astrya from the App Store, Apple's standard licence agreement also applies to your use of the app.",
    ],
  },
  {
    title: "Changes",
    points: [
      "These terms may be updated. The date at the top changes when they do. Using Astrya after a change means you accept the new terms.",
    ],
  },
];

/**
 * The public terms of use, linked from Profile, the landing footer and App
 * Store Connect. A plain statement for a free hobby app, not legal advice.
 */
export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <Link href="/" className="eyebrow">Astrya</Link>
        <h1 className="headline mt-4 text-5xl sm:text-6xl">Terms of use</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Last updated {LEGAL_UPDATED}. By using Astrya you agree to these terms and to the{" "}
          <Link href={PRIVACY_PATH} className="font-semibold text-fg underline underline-offset-2">Privacy policy</Link>.
        </p>

        {SECTIONS.map((s) => (
          <section key={s.title} className="mt-8 border-t border-rule pt-5">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted">
              {s.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </section>
        ))}

        <section className="mt-8 border-t border-rule pt-5">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Questions about these terms:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-fg underline underline-offset-2">{CONTACT_EMAIL}</a>.
            Apple&apos;s{" "}
            <a href={TERMS_URL} className="font-semibold text-fg underline underline-offset-2">standard licence agreement</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
