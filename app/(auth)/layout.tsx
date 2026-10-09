import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="atmosphere atmosphere-dusk flex min-h-dvh flex-col px-5 py-6 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5 self-start text-lg font-medium tracking-tight">
        <span className="astra-mark" aria-hidden />
        Astrya
      </Link>
      <div className="flex flex-1 flex-col items-center justify-center py-10">{children}</div>
    </main>
  );
}
