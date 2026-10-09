import Link from "next/link";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AccuracyCard } from "@/components/AccuracyCard";
import { MoodCheckin } from "@/components/MoodCheckin";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadPredictions } from "@/lib/memory/store";
import { scorecard } from "@/lib/memory/scorecard";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const FEATURES: {
  href: string;
  tag: string;
  fill: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  external?: boolean;
  wide?: boolean;
}[] = [
  {
    href: "/app/chat",
    tag: "Reading",
    fill: "bg-ember",
    title: "Ask a reading",
    blurb: "Love, work, timing, anything on your mind. Every answer is read from your own birth chart, in the tradition you pick.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>,
    wide: true,
  },
  {
    href: "/api/kundli",
    tag: "PDF",
    fill: "bg-violet",
    title: "Your kundli (PDF)",
    blurb: "Download your birth chart as a PDF to keep, print or share.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>,
    external: true,
  },
  {
    href: "/app/profiles",
    tag: "People",
    fill: "bg-fg",
    title: "People",
    blurb: "Save a partner, a parent or a friend and see how your charts meet.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7M22 21a7 7 0 00-4.5-6.5" /></svg>,
  },
  {
    href: "/app/profile",
    tag: "Account",
    fill: "bg-accent",
    title: "Profile",
    blurb: "Birth details, photo and account. Changing your birth data recomputes your chart.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0" /></svg>,
  },
];

function FeatureCard({ f }: { f: (typeof FEATURES)[number] }) {
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
        <span className={`brut-tag ${f.fill} ${f.wide ? "mr-24 sm:mr-28" : ""}`}>{f.tag}</span>
      </div>
      <h2 className={`headline mt-5 ${f.wide ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{f.title}</h2>
      <p className="mt-2 max-w-md flex-1 text-sm leading-relaxed text-muted">{f.blurb}</p>
      <span className="mt-5 flex items-center justify-between border-t border-rule pt-4 text-sm font-medium">
        Open
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

  if (!profile) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-8">
          <ScreenHeader
            eyebrow="First step"
            title="Let's build your chart"
            arrow
            size="xl"
            blurb="We compute your real birth chart from your date, time, and place."
          />
          <Link href="/app/intake" className="brut-btn brut-btn-accent brut-btn-arrow mt-8 min-h-[54px] w-full">
            Enter birth details
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
          eyebrow="Home"
          title={<>Hello,<br />{profile.first_name}</>}
          arrow
          size="xl"
          blurb="Your chart is ready. Pick where to go."
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
            <FeatureCard key={f.href} f={f} />
          ))}
        </div>
      </div>
    </div>
  );
}
