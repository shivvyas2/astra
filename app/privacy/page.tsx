import type { Metadata } from "next";
import Link from "next/link";
import { CONSENT_COPY, TERMS_URL } from "@/lib/billing/copy";

export const metadata: Metadata = {
  title: "Privacy · Astrya",
  description: "What Astrya collects, what it sends to Anthropic to write readings, and how to delete it.",
};

/**
 * The public privacy policy, linked from the consent screen, the paywall and
 * App Store Connect. OWNER: review before submission and add a contact
 * address; this is a plain statement of how the code behaves, not legal advice.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <Link href="/" className="eyebrow">Astrya</Link>
        <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">Privacy</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Astrya reads your birth chart with the help of an AI model. This page says what that involves. Inside the app you
          are asked to agree to it before your first reading, and you can withdraw that agreement in Profile at any time.
        </p>

        {CONSENT_COPY.sections.map((s) => (
          <section key={s.title} className="mt-8 border-t-2 border-fg/20 pt-5">
            <h2 className="text-lg font-extrabold">{s.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted">
              {s.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </section>
        ))}

        <section className="mt-8 border-t-2 border-fg/20 pt-5">
          <h2 className="text-lg font-extrabold">Accounts and hosting</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted">
            <li>Your email (or Sign in with Apple identifier) is used to sign you in. Data is stored with Supabase and the app runs on Vercel.</li>
            <li>Every table is protected so your account can only read its own rows. Server keys never leave the server.</li>
            <li>There is no advertising, no analytics SDK and no third-party crash reporter. Your data is not sold.</li>
          </ul>
        </section>

        <section className="mt-8 border-t-2 border-fg/20 pt-5">
          <h2 className="text-lg font-extrabold">Subscriptions</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted">
            <li>Astrya Plus is sold through Apple. Apple handles payment; Astrya never sees your card.</li>
            <li>Astrya stores the subscription&apos;s product, status, renewal date and Apple&apos;s transaction id, to show your plan.</li>
            <li>
              Subscriptions are governed by Apple&apos;s{" "}
              <a href={TERMS_URL} className="font-bold text-fg underline underline-offset-2">standard licence agreement</a>.
            </li>
          </ul>
        </section>

        <section className="mt-8 border-t-2 border-fg/20 pt-5">
          <h2 className="text-lg font-extrabold">Deleting your data</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted">
            <li>Delete any remembered fact, or all of them, in Profile under What Astrya knows.</li>
            <li>Delete a conversation and its summary from your reading history.</li>
            <li>Delete your account in Profile: your chart, readings, memory and alerts are removed with it.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
