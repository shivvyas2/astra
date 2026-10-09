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
  "/app/profiles": "People",
  "/app/plus": "Astrya Plus",
};

// The colour field behind each section, as in the app: warm for a reading,
// lime for Plus, dusk everywhere else.
function moodFor(pathname: string) {
  if (pathname === "/app/chat") return "atmosphere-ember";
  if (pathname === "/app/plus") return "atmosphere-lime";
  return "atmosphere-dusk";
}

const TAG_FILL: Record<string, string> = { vedic: "bg-ember", western: "bg-violet", numerology: "bg-accent" };

type IconProps = { className?: string };
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function HomeIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M3 11l9-8 9 8v9a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2z" /></svg>;
}
function ChatIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>;
}
function FileIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>;
}
function UserIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0" /></svg>;
}
function PeopleIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7M22 21a7 7 0 00-4.5-6.5" /></svg>;
}
function MenuIcon(p: IconProps) {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
function CloseIcon(p: IconProps) {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

const NAV: { href: string; label: string; blurb: string; icon: (p: IconProps) => React.JSX.Element; external?: boolean }[] = [
  { href: "/app", label: "Home", blurb: "Your chart at a glance", icon: HomeIcon },
  { href: "/app/chat", label: "New reading", blurb: "Ask anything, read from your chart", icon: ChatIcon },
  { href: "/api/kundli", label: "Kundli", blurb: "Your birth chart as a PDF", icon: FileIcon, external: true },
  { href: "/app/profiles", label: "People", blurb: "Partners, family, compatibility", icon: PeopleIcon },
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
  const isCurrent = (href: string) =>
    href === "/app/chat"
      ? pathname === href && !activeId
      : href === "/app/profiles"
        ? pathname.startsWith(href) || pathname.startsWith("/app/compatibility")
        : pathname === href;

  const nav = (
    <div className="flex h-full flex-col p-3">
      <div className="flex items-center justify-between px-3 pb-5 pt-3">
        <Link href="/app" onClick={close} className="flex items-center gap-2.5 text-lg font-medium tracking-tight">
          <span className="astra-mark" aria-hidden />
          Astrya
        </Link>
        <button type="button" aria-label="Close menu" onClick={close} className="circle-btn h-9 w-9 md:hidden">
          <CloseIcon />
        </button>
      </div>

      <nav aria-label="Sections" className="space-y-1">
        {NAV.map(({ href, label, blurb, icon: Icon, external }) => {
          const current = isCurrent(href);
          const cls = `flex items-start gap-3 rounded-[14px] border px-3 py-2.5 transition-colors ${
            current ? "border-line bg-fg/[0.06]" : "border-transparent hover:bg-fg/[0.04]"
          }`;
          const body = (
            <>
              <Icon className={`mt-0.5 shrink-0 ${current ? "text-accent" : "text-fg"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{label}</span>
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
              className={`flex items-center gap-2 rounded-[14px] border px-3 py-2 text-sm transition-colors ${
                current ? "border-line bg-fg/[0.06] text-fg" : "border-transparent text-muted hover:bg-fg/[0.04] hover:text-fg"
              }`}
            >
              <span className={`brut-tag shrink-0 ${TAG_FILL[c.tradition] ?? "bg-fg"}`}>{c.tradition}</span>
              <span className="truncate">{c.title ?? "Reading"}</span>
            </Link>
          );
        })}
      </nav>

      <form action={signOut} className="mt-3 border-t border-rule pt-3">
        <button className="brut-btn brut-btn-quiet w-full py-2 text-sm text-muted hover:text-fg">Sign out</button>
      </form>
    </div>
  );

  return (
    <div className={`atmosphere ${moodFor(pathname)} flex h-dvh overflow-hidden text-fg`}>
      <aside className="hidden w-72 shrink-0 border-r border-rule md:block">{nav}</aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={close} />
          <aside className="absolute left-0 top-0 h-full w-80 max-w-[85%] border-r border-rule bg-bg">{nav}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 px-4 pb-1 pt-3 md:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="circle-btn h-[38px] w-[38px]">
            <MenuIcon />
          </button>
          <span className="text-[15px] font-semibold tracking-tight">{section}</span>
          <Link href="/app" aria-label="Astrya home" className="ml-auto grid h-[38px] w-[38px] place-items-center">
            <span className="astra-mark" aria-hidden />
          </Link>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
