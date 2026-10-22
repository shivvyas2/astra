import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED, PRIVACY_PATH, TERMS_URL } from "@/lib/billing/copy";
import { getI18n, getLegal } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";
import { LegalHeader, LegalSection } from "@/components/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.termsTitle, description: t.meta.termsDescription };
}

const linkCls = "font-semibold text-fg underline underline-offset-2";

/**
 * The public terms of use, linked from Profile, the landing footer and App
 * Store Connect. A plain statement for a free hobby app, not legal advice.
 * Translated in full (lib/i18n/legal); the English text governs.
 */
export default async function TermsPage() {
  const [i18n, { legal }] = await Promise.all([getI18n(), getLegal()]);
  const { f } = i18n;
  // LEGAL_UPDATED is written in English; the translations show it in their own month names.
  const updated = i18n.locale === "en" ? LEGAL_UPDATED : i18n.date(`${LEGAL_UPDATED} 12:00`, { day: "numeric", month: "long", year: "numeric" });
  const terms = legal.terms;
  const links = {
    apple: (s: string) => <a href={TERMS_URL} className={linkCls}>{s}</a>,
    privacy: (s: string) => <Link href={PRIVACY_PATH} className={linkCls}>{s}</Link>,
    email: (s: string) => <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>{s}</a>,
  };

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <LegalHeader title={terms.title} authoritative={legal.authoritative} />
        <p className="mt-4 text-[15px] leading-relaxed text-muted">{rich(f(terms.intro, { date: updated }), links)}</p>

        {terms.sections.map((s) => (
          <LegalSection key={s.title} title={s.title} points={s.points} />
        ))}

        <section className="mt-8 border-t border-rule pt-5">
          <h2 className="text-lg font-semibold">{terms.contactTitle}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{rich(f(terms.contact, { email: CONTACT_EMAIL }), links)}</p>
        </section>
      </div>
    </main>
  );
}
