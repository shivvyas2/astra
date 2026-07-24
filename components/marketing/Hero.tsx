import Image from "next/image";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden sm:min-h-[90vh]">
      <Image src="/images/planet-sun.jpg" alt="" fill priority className="object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
      <div className="relative z-10 w-full px-5 py-24 sm:px-6 md:px-16 md:py-0">
        <p className="mb-4 text-xs uppercase tracking-widest text-muted sm:text-sm">Astrology: computed, not guessed</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl sm:leading-[0.95] md:text-8xl">
          Your chart,<br />read by the stars.
        </h1>
        <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
          Enter your birth date, time, and place. We compute your real Vedic or Western birth chart and let you
          ask it anything: your future, a kundli reading, or life advice.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-md bg-fg px-6 py-3 font-medium text-bg">Get your reading</Link>
          <Link href="/login" className="rounded-md border border-white/25 px-6 py-3">Log in</Link>
        </div>
      </div>
    </section>
  );
}
