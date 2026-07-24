import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link href="/admin" className="text-xl font-bold">Astra Admin</Link>
        <form action={signOut}><button className="text-sm text-muted">Sign out</button></form>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
