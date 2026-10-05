"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";

type Conv = { id: string; tradition: string; title: string | null; created_at: string };

const SECTION_NAMES: Record<string, string> = {
  "/app": "Home",
  "/app/chat": "Reading",
  "/app/profile": "Profile",
  "/app/intake": "Birth details",
};

const TAG_FILL: Record<string, string> = { vedic: "bg-accent", western: "bg-violet", numerology: "bg-yellow" };

type IconProps = { className?: string };
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function HomeIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M3 11l9-8 9 8v9a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2z" /></svg>;
}
function SparkIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M12 3l2.1 6.4L21 11l-6.9 1.6L12 19l-2.1-6.4L3 11l6.9-1.6z" /></svg>;
}
function FileIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>;
}
function UserIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0" /></svg>;
}
function MenuIcon(p: IconProps) {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
function CloseIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

const NAV: { href: string; label: string; blurb: string; icon: (p: IconProps) => React.JSX.Element; external?: boolean }[] = [
  { href: "/app", label: "Home", blurb: "Your chart at a glance", icon: HomeIcon },
  { href: "/app/chat", label: "New reading", blurb: "Ask anything, read from your chart", icon: SparkIcon },
  { href: "/api/kundli", label: "Kundli", blurb: "Your birth chart as a PDF", icon: FileIcon, external: true },
  { href: "/app/profile", label: "Profile", blurb: "Birth details, photo, account", icon: UserIcon },
];

export function AppShell({ conversations, children }: { conversations: Conv[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const params = useSearchParams();
  const pathname = usePathname();
  const activeId = params.get("c");
  const close = () => setOpen(false);
  const section = SECTION_NAMES[pathname] ?? "Astrya";

  // "New reading" is only current on a fresh chat; a past reading is marked in its own list.
  const isCurrent = (href: string) => (href === "/app/chat" ? pathname === href && !activeId : pathname === href);

  const nav = (
    <div className="flex h-full flex-col p-3">
      <div className="flex items-center justify-between px-3 pb-4 pt-2">
        <Link href="/app" onClick={close} className="eyebrow">Astrya</Link>
        <button type="button" aria-label="Close menu" onClick={close} className="brut-btn brut-btn-quiet h-8 w-8 p-0 md:hidden">
          <CloseIcon />
        </button>
      </div>

      <nav aria-label="Sections" className="space-y-1">
        {NAV.map(({ href, label, blurb, icon: Icon, external }) => {
          const current = isCurrent(href);
          const cls = `flex items-start gap-3 px-3 py-2.5 transition-colors ${
            current ? "brut-bordered bg-surface-raised" : "rounded-sm border-2 border-transparent hover:bg-surface"
          }`;
          const body = (
            <>
              <Icon className={`mt-0.5 shrink-0 ${current ? "text-accent" : "text-fg"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight">{label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{blurb}</span>
              </span>
            </>
          );
          return external ? (
            <a key={href} href={href} onClick={close} className={cls}>{body}</a>
          ) : (
            <Link key={href} href={href} onClick={close} aria-current={current ? "page" : undefined} className={cls}>{body}</Link>
          );
        })}
      </nav>

      <p className="eyebrow mt-6 px-3 pb-2">Past readings</p>
      <nav aria-label="Past readings" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {conversations.length === 0 && <p className="px-3 py-1 text-xs text-muted">No readings yet.</p>}
        {conversations.map((c) => {
          const current = activeId === c.id && pathname === "/app/chat";
          return (
            <Link
              key={c.id}
              href={`/app/chat?c=${c.id}`}
              onClick={close}
              title={c.title ?? "Reading"}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2 rounded-sm border-2 px-3 py-2 text-sm transition-colors ${
                current ? "border-fg bg-surface-raised text-fg" : "border-transparent text-muted hover:bg-surface hover:text-fg"
              }`}
            >
              <span className={`brut-tag shrink-0 ${TAG_FILL[c.tradition] ?? "bg-fg"}`}>{c.tradition}</span>
              <span className="truncate">{c.title ?? "Reading"}</span>
            </Link>
          );
        })}
      </nav>

      <form action={signOut} className="mt-3 border-t-2 border-fg pt-3">
        <button className="brut-btn brut-btn-quiet w-full py-2 text-sm">Sign out</button>
      </form>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <aside className="hidden w-72 shrink-0 border-r-2 border-fg md:block">{nav}</aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={close} />
          <aside className="absolute left-0 top-0 h-full w-80 max-w-[85%] border-r-2 border-fg bg-bg">{nav}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="brut-bordered mx-3 mt-3 flex items-center gap-3 py-2 pl-2 pr-3 md:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="brut-btn brut-btn-quiet h-9 w-9 p-0">
            <MenuIcon />
          </button>
          <span className="text-sm font-black tracking-tight">{section}</span>
          <Link href="/app" className="eyebrow ml-auto">Astrya</Link>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
