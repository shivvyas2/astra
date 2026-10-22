import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED, PLUS_ENABLED, TERMS_PATH, TERMS_URL } from "@/lib/billing/copy";
import { getI18n, getLegal } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";
import { LegalHeader, LegalSection } from "@/components/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.privacyTitle, description: t.meta.privacyDescription };
}

const linkCls = "font-semibold text-fg underline underline-offset-2";

/**
 * The public privacy policy, linked from the consent screen, the paywall and
 * App Store Connect. A plain statement of how the code behaves, not legal
 * advice. Translated in full; the English text governs, and a translated page
 * says so at the top.
 */
export default async function PrivacyPage() {
  const [i18n, { legal }] = await Promise.all([getI18n(), getLegal()]);
  const { f } = i18n;
  // LEGAL_UPDATED is written in English; the translations show it in their own month names.
  const updated = i18n.locale === "en" ? LEGAL_UPDATED : i18n.date(`${LEGAL_UPDATED} 12:00`, { day: "numeric", month: "long", year: "numeric" });
  const { t } = i18n;
  const p = legal.privacy;
  const links = {
    apple: (s: string) => <a href={TERMS_URL} className={linkCls}>{s}</a>,
    terms: (s: string) => <Link href={TERMS_PATH} className={linkCls}>{s}</Link>,
    email: (s: string) => <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>{s}</a>,
  };

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <LegalHeader title={p.title} authoritative={legal.authoritative} />
        <p className="mt-4 text-[15px] leading-relaxed text-muted">{f(p.intro, { date: updated })}</p>

        {[...t.consent.sections, ...p.sections].map((s) => (
          <LegalSection key={s.title} title={s.title} points={s.points} />
        ))}

        {PLUS_ENABLED && (
          <LegalSection title={p.subscriptions.title} points={p.subscriptions.points.map((point) => rich(point, links))} />
        )}

        {p.after.map((s) => (
          <LegalSection key={s.title} title={s.title} points={s.points} />
        ))}

        <section className="mt-8 border-t border-rule pt-5">
          <h2 className="text-lg font-semibold">{p.contactTitle}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{rich(f(p.contact, { email: CONTACT_EMAIL }), links)}</p>
        </section>
      </div>
    </main>
  );
}
