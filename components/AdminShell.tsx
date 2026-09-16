"use client";
import { useState } from "react";
import Link from "next/link";
import { adminSignOut } from "@/app/admin/actions";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const nav = (
    <div className="flex h-full flex-col p-3">
      <div className="mb-5 px-2">
        <div className="text-lg font-bold tracking-tight">Sanchara</div>
        <div className="text-[11px] uppercase tracking-widest text-accent">Admin</div>
      </div>
      <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted/60">Menu</div>
      <nav className="flex-1 space-y-0.5">
        <Link href="/admin" onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-lg bg-accent/15 px-3 py-2 text-sm text-accent">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 10a3 3 0 100-6 3 3 0 000 6M21 20v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Users
        </Link>
      </nav>
      <form action={adminSignOut} className="mt-2 border-t border-white/10 pt-2">
        <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-white/5 hover:text-fg">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-60 shrink-0 border-r border-white/10 md:block">{nav}</aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 max-w-[82%] border-r border-white/10 bg-bg">{nav}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 md:hidden">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="text-muted">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
          <span className="text-base font-bold">Sanchara <span className="text-accent">Admin</span></span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
