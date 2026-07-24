"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";

export default function CosmicHero() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      if (titleRef.current) titleRef.current.style.visibility = "visible";
      return;
    }
    const ctx = gsap.context(() => {
      if (titleRef.current) {
        gsap.set(titleRef.current, { visibility: "visible" });
        gsap.from(titleRef.current.querySelectorAll(".ch"), {
          y: 120, opacity: 0, duration: 1.1, stagger: 0.05, ease: "power4.out",
        });
      }
      if (subRef.current) {
        gsap.from(subRef.current, { y: 30, opacity: 0, duration: 1, delay: 0.5, ease: "power3.out" });
      }
    });
    return () => ctx.revert();
  }, []);

  const split = (s: string) =>
    s.split("").map((ch, i) => (
      <span key={i} className="ch inline-block">{ch}</span>
    ));

  return (
    <div className="relative min-h-[100svh]">
      {/* Planet photo background */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/planet-sun.jpg)" }} />

      <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
        <p className="animate-fade-in mb-4 text-xs uppercase tracking-[0.3em] text-muted">
          Computed astrology, never guessed
        </p>
        <h1 ref={titleRef} style={{ visibility: "hidden" }}
          className="max-w-full break-words text-5xl font-bold leading-none tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)] sm:text-8xl md:text-9xl">
          {split("ASTRA")}
        </h1>
        <div ref={subRef} className="mt-6 max-w-2xl space-y-1 text-base text-fg/85 drop-shadow-[0_1px_12px_rgba(0,0,0,0.7)] sm:text-lg">
          <p>Your real birth chart, read by the stars.</p>
          <p>A Vedic and Western engine that computes your actual chart, then explains your future in plain words.</p>
        </div>
        <div className="animate-fade-up delay-2 mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="rounded-lg bg-fg px-6 py-3 font-medium text-bg transition-transform hover:scale-[1.03]">
            Get your reading
          </Link>
          <Link href="/login" className="rounded-lg border border-white/30 bg-black/20 px-6 py-3 backdrop-blur-sm transition-colors hover:bg-white/10">
            Log in
          </Link>
        </div>
      </section>
    </div>
  );
}
