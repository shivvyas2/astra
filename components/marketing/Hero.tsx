import Image from "next/image";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

export async function Hero() {
  const { t } = await getI18n();
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden sm:min-h-[90vh]">
      <Image src="/images/planet-sun.jpg" alt="" fill priority className="object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
      <div className="relative z-10 w-full px-5 py-24 sm:px-6 md:px-16 md:py-0">
        <p className="mb-4 text-xs uppercase tracking-widest text-muted sm:text-sm">{t.landing.heroAltEyebrow}</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl sm:leading-[0.95] md:text-8xl">
          {t.landing.heroAltTitle}
        </h1>
        <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">{t.landing.heroAltBody}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-md bg-fg px-6 py-3 font-medium text-bg">{t.landing.getReading}</Link>
          <Link href="/login" className="rounded-md border border-white/25 px-6 py-3">{t.landing.logIn}</Link>
        </div>
      </div>
    </section>
  );
}
