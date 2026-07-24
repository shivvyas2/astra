"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";

type Conv = { id: string; tradition: string; title: string | null; created_at: string };

export function AppShell({ conversations, children }: { conversations: Conv[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const params = useSearchParams();
  const pathname = usePathname();
  const activeId = params.get("c");

  const nav = (
    <div className="flex h-full flex-col p-3">
      <Link href="/app" onClick={() => setOpen(false)} className="mb-3 px-2 text-lg font-bold tracking-tight">
        Astra
      </Link>
      <Link
        href="/app/chat"
        onClick={() => setOpen(false)}
        className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm transition-colors hover:bg-white/5"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        New reading
      </Link>
      <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted/60">Past readings</div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {conversations.length === 0 && <p className="px-2 py-1 text-xs text-muted/60">No readings yet.</p>}
        {conversations.map((c) => {
          const active = activeId === c.id && pathname === "/app/chat";
          return (
            <Link
              key={c.id}
              href={`/app/chat?c=${c.id}`}
              onClick={() => setOpen(false)}
              title={c.title ?? "Reading"}
              className={`block truncate rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-white/10 text-fg" : "text-muted hover:bg-white/5 hover:text-fg"
              }`}
            >
              {c.title ?? "Reading"}
            </Link>
          );
        })}
      </nav>
      <form action={signOut} className="mt-2 border-t border-white/10 pt-2">
        <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-white/5 hover:text-fg">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-white/10 md:block">{nav}</aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[82%] border-r border-white/10 bg-bg">{nav}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:hidden">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="text-muted">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          <Link href="/app" className="text-base font-bold">Astra</Link>
          <span className="w-[22px]" />
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
