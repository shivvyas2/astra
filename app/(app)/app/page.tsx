import Link from "next/link";
import { getBirthProfile } from "@/lib/data/birthProfile";

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
    fill: "bg-accent",
    title: "Ask a reading",
    blurb: "Love, work, timing, anything on your mind. Every answer is read from your own birth chart, in the tradition you pick.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M12 3l2.1 6.4L21 11l-6.9 1.6L12 19l-2.1-6.4L3 11l6.9-1.6z" /></svg>,
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
    href: "/app/profile",
    tag: "Account",
    fill: "bg-yellow",
    title: "Profile",
    blurb: "Birth details, photo and account. Changing your birth data recomputes your chart.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0" /></svg>,
  },
];

function FeatureCard({ f }: { f: (typeof FEATURES)[number] }) {
  const cls = `brut-card block p-5 transition-colors hover:bg-surface-raised ${f.wide ? "sm:col-span-2" : ""}`;
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-sm border-2 border-fg bg-bg text-fg">{f.icon}</span>
        <span className={`brut-tag ${f.fill}`}>{f.tag}</span>
      </div>
      <h2 className="mt-4 text-xl font-black tracking-tight">{f.title}</h2>
      <p className="mt-1.5 text-sm text-muted">{f.blurb}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold">
        Open <span aria-hidden>→</span>
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
        <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-5 py-8 text-center">
          <p className="eyebrow">First step</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Let&apos;s build your chart</h1>
          <p className="mt-3 max-w-sm text-sm text-muted">
            We compute your real birth chart from your date, time, and place.
          </p>
          <Link href="/app/intake" className="brut-btn brut-btn-accent mt-7 w-full max-w-xs py-3">
            Enter birth details
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
        <div className="flex items-center gap-4">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-sm border-2 border-fg object-cover" />
          ) : null}
          <div>
            <p className="eyebrow">Home</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Hello, {profile.first_name}</h1>
          </div>
        </div>
        <p className="mt-3 max-w-md text-sm text-muted">Your chart is ready. Pick where to go.</p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <FeatureCard key={f.href} f={f} />
          ))}
        </div>
      </div>
    </div>
  );
}
