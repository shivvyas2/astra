"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type Section = {
  eyebrow: string;
  title: string;
  lines: string[];
  cta?: { primary: { label: string; href: string }; secondary?: { label: string; href: string } };
};

const HERO: Section = {
  eyebrow: "Computed astrology, never guessed",
  title: "ASTRA",
  lines: ["Your real birth chart, read by the stars."],
  cta: {
    primary: { label: "Get your reading", href: "/signup" },
    secondary: { label: "Log in", href: "/login" },
  },
};

const SECTIONS: Section[] = [
  {
    eyebrow: "A real engine",
    title: "THE SCIENCE",
    lines: [
      "We compute your exact chart with the Swiss Ephemeris:",
      "ascendant, houses, nakshatras, and your Vimshottari dasha.",
    ],
  },
  {
    eyebrow: "Vedic, Western & Numerology",
    title: "YOUR CHART",
    lines: [
      "Switch between sidereal Vedic, tropical Western, and numerology.",
      "Every answer is grounded in your actual placements.",
    ],
  },
  {
    eyebrow: "Ask anything",
    title: "YOUR FUTURE",
    lines: [
      "Career, relationships, timing, a kundli reading,",
      "explained in plain words anyone can understand.",
    ],
    cta: { primary: { label: "Create your free account", href: "/signup" } },
  },
];

export default function CosmicHero() {
  const root = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      if (titleRef.current) titleRef.current.style.visibility = "visible";
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      // Hero intro
      if (titleRef.current) {
        gsap.set(titleRef.current, { visibility: "visible" });
        gsap.from(titleRef.current.querySelectorAll(".ch"), {
          y: 120, opacity: 0, duration: 1.1, stagger: 0.05, ease: "power4.out",
        });
      }
      // Cinematic scroll reveals for the dark sections
      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
        gsap.from(el.children, {
          y: 60,
          opacity: 0,
          duration: 1,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 78%" },
        });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  const split = (s: string) => s.split("").map((ch, i) => <span key={i} className="ch inline-block">{ch}</span>);

  return (
    <div ref={root}>
      {/* HERO — planet photo background */}
      <section className="relative flex min-h-[100svh] flex-col items-center justify-center bg-cover bg-center px-6 text-center"
        style={{ backgroundImage: "url(/images/planet-sun.jpg)" }}>
        <p className="animate-fade-in mb-4 text-xs uppercase tracking-[0.3em] text-fg/70 drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]">
          {HERO.eyebrow}
        </p>
        <h1 ref={titleRef} style={{ visibility: "hidden" }}
          className="max-w-full break-words text-5xl font-bold leading-none tracking-tight drop-shadow-[0_2px_24px_rgba(0,0,0,0.75)] sm:text-8xl md:text-9xl">
          {split(HERO.title)}
        </h1>
        <div className="mt-6 max-w-2xl text-base text-fg/85 drop-shadow-[0_1px_12px_rgba(0,0,0,0.9)] sm:text-lg">
          {HERO.lines.map((l, k) => <p key={k}>{l}</p>)}
        </div>
        <div className="animate-fade-up delay-2 mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href={HERO.cta!.primary.href} className="rounded-lg bg-fg px-6 py-3 font-medium text-bg transition-transform hover:scale-[1.03]">
            {HERO.cta!.primary.label}
          </Link>
          <Link href={HERO.cta!.secondary!.href} className="rounded-lg border border-white/30 bg-black/25 px-6 py-3 backdrop-blur-sm transition-colors hover:bg-white/10">
            {HERO.cta!.secondary!.label}
          </Link>
        </div>
      </section>

      {/* DARK sections with cinematic scroll reveals */}
      {SECTIONS.map((s, i) => (
        <section key={i} className="flex min-h-[100svh] flex-col items-center justify-center bg-bg px-6 text-center">
          <div className="reveal flex flex-col items-center">
            <p className="mb-4 text-xs uppercase tracking-[0.3em] text-muted">{s.eyebrow}</p>
            <h2 className="max-w-full break-words text-4xl font-bold leading-none tracking-tight sm:text-7xl">{s.title}</h2>
            <div className="mt-6 max-w-2xl space-y-1 text-base text-muted sm:text-lg">
              {s.lines.map((l, k) => <p key={k}>{l}</p>)}
            </div>
            {s.cta && (
              <div className="mt-9">
                <Link href={s.cta.primary.href} className="rounded-lg bg-accent px-6 py-3 font-medium text-bg transition-transform hover:scale-[1.03]">
                  {s.cta.primary.label}
                </Link>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
