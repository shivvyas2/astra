import Link from "next/link";
import { adminSignOut } from "@/app/admin/actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
        <Link href="/admin" className="text-lg font-bold sm:text-xl">Astra Admin</Link>
        <form action={adminSignOut}><button className="text-sm text-muted">Sign out</button></form>
      </header>
      <main className="px-5 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
