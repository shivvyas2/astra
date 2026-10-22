import Link from "next/link";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AccuracyCard } from "@/components/AccuracyCard";
import { MoodCheckin } from "@/components/MoodCheckin";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadPredictions } from "@/lib/memory/store";
import { scorecard } from "@/lib/memory/scorecard";
import { getI18n } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n/en";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

type Feature = {
  href: string;
  key: keyof Messages["home"]["features"];
  fill: string;
  icon: React.ReactNode;
  external?: boolean;
  wide?: boolean;
};

const FEATURES: Feature[] = [
  {
    href: "/app/chat",
    key: "chat",
    fill: "bg-ember",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>,
    wide: true,
  },
  {
    href: "/api/kundli",
    key: "kundli",
    fill: "bg-violet",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>,
    external: true,
  },
  {
    href: "/app/profiles",
    key: "people",
    fill: "bg-fg",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7M22 21a7 7 0 00-4.5-6.5" /></svg>,
  },
  {
    href: "/app/profile",
    key: "profile",
    fill: "bg-accent",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0" /></svg>,
  },
];

function FeatureCard({ f, t }: { f: Feature; t: Messages }) {
  const { tag, title, blurb } = t.home.features[f.key];
  const cls = `brut-card group relative flex flex-col overflow-hidden p-5 transition-colors hover:border-fg ${f.wide ? "sm:col-span-2 sm:p-7" : ""}`;
  const inner = (
    <>
      {f.wide && (
        <span className="orbit -right-6 -top-10 [--orbit:150px]" aria-hidden>
          <span className="astra-mark" />
        </span>
      )}
      <div className="flex items-center justify-between">
        <span className="circle-btn pointer-events-none">{f.icon}</span>
        <span className={`brut-tag ${f.fill} ${f.wide ? "mr-24 sm:mr-28" : ""}`}>{tag}</span>
      </div>
      <h2 className={`headline mt-5 ${f.wide ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{title}</h2>
      <p className="mt-2 max-w-md flex-1 text-sm leading-relaxed text-muted">{blurb}</p>
      <span className="mt-5 flex items-center justify-between border-t border-rule pt-4 text-sm font-medium">
        {t.common.open}
        <span className={`circle-btn pointer-events-none h-9 w-9 transition-transform duration-200 group-hover:translate-x-0.5 ${f.wide ? "circle-btn-accent" : ""}`} aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
      </span>
    </>
  );
  return f.external ? (
    <a href={f.href} className={cls}>{inner}</a>
  ) : (
    <Link href={f.href} className={cls}>{inner}</Link>
  );
}

export default async function AppHome() {
  const profile = await getBirthProfile();
  const { t } = await getI18n();

  if (!profile) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-8">
          <ScreenHeader
            eyebrow={t.home.firstEyebrow}
            title={t.home.firstTitle}
            arrow
            size="xl"
            blurb={t.home.firstBlurb}
          />
          <Link href="/app/intake" className="brut-btn brut-btn-accent brut-btn-arrow mt-8 min-h-[54px] w-full">
            {t.home.enterDetails}
          </Link>
        </div>
      </div>
    );
  }

  // Astrya's record with this person, once a reading has made a prediction.
  const { predictions } = await loadPredictions(await createServerSupabase(), 100);
  const card = predictions.length > 0 ? scorecard(predictions, new Date().toISOString().slice(0, 10)) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
        <ScreenHeader
          eyebrow={t.home.eyebrow}
          title={<>{t.home.hello}<br />{profile.first_name}</>}
          arrow
          size="xl"
          blurb={t.home.blurb}
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="mt-5 h-14 w-14 rounded-full border border-line object-cover" />
          ) : null}
        </ScreenHeader>

        <MoodCheckin className="mt-10" />

        {card && (
          <div className="mt-10">
            <AccuracyCard card={card} href="/app/profile#predictions" />
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <FeatureCard key={f.href} f={f} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
