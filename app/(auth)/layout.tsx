import Link from "next/link";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="atmosphere atmosphere-dusk flex min-h-dvh flex-col px-5 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-medium tracking-tight">
          Astrya
        </Link>
        <LocaleSwitcher />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-10">{children}</div>
    </main>
  );
}
