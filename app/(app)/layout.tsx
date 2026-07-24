import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
        <Link href="/app" className="text-lg font-bold tracking-tight sm:text-xl">Astra</Link>
        <form action={signOut}><button className="text-sm text-muted">Sign out</button></form>
      </header>
      <main className="px-5 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
