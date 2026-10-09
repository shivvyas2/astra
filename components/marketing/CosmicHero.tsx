"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AppShowcase, ChartFactsVisual, ReadingVisual, TraditionsVisual } from "./Showcase";

type Section = {
  eyebrow: string;
  title: string;
  lines: string[];
  visual?: React.ReactNode;
  cta?: { primary: { label: string; href: string }; secondary?: { label: string; href: string } };
};

const HERO: Section = {
  eyebrow: "Computed astrology, never guessed",
  title: "Astrya",
  lines: ["Your real birth chart, read by the stars."],
  cta: {
    primary: { label: "Get your reading", href: "/signup" },
    secondary: { label: "Log in", href: "/login" },
  },
};

const SECTIONS: Section[] = [
  {
    eyebrow: "A real engine",
    title: "The science",
    lines: [
      "We compute your exact chart with the Swiss Ephemeris:",
      "ascendant, houses, nakshatras, and your Vimshottari dasha.",
    ],
    visual: <ChartFactsVisual />,
  },
  {
    eyebrow: "Vedic, Western & Numerology",
    title: "Your chart",
    lines: [
      "Switch between sidereal Vedic, tropical Western, and numerology.",
      "Every answer is grounded in your actual placements.",
    ],
    visual: <TraditionsVisual />,
  },
  {
    eyebrow: "Ask anything",
    title: "Your future",
    lines: [
      "Career, relationships, timing, a kundli reading,",
      "explained in plain words anyone can understand.",
    ],
    visual: <ReadingVisual />,
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
    <div ref={root} className="atmosphere atmosphere-dusk">
      {/* Top bar: the mark and the way back in, as in the app. */}
      <nav className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-medium tracking-tight">
          <span className="astra-mark" aria-hidden />
          Astrya
        </Link>
        <Link href={HERO.cta!.secondary!.href} className="brut-btn brut-btn-secondary bg-bg/40 px-4 py-2 text-sm backdrop-blur-sm">
          {HERO.cta!.secondary!.label}
        </Link>
      </nav>

      {/* HERO — the planet photo, darkened toward the foot so the huge word sits on the ground. */}
      <section className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden px-5 pb-14 pt-28 sm:px-8 sm:pb-20">
        <div aria-hidden className="absolute inset-0 -z-10 bg-cover bg-center opacity-70" style={{ backgroundImage: "url(/images/planet-sun.jpg)" }} />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-bg/10 via-bg/40 to-bg" />
        <span className="orbit right-[6%] top-[18%] hidden [--orbit:260px] sm:block" aria-hidden>
          <span className="astra-mark" />
        </span>
        <p className="screen-eyebrow animate-fade-in">{HERO.eyebrow}</p>
        <h1 ref={titleRef} style={{ visibility: "hidden" }}
          className="headline mt-4 max-w-full break-words text-[22vw] leading-[0.86] text-accent sm:text-[18vw] lg:text-[15rem]">
          {split(HERO.title)}
        </h1>
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md text-lg leading-snug text-fg/90 sm:text-xl">
            {HERO.lines.map((l, k) => <p key={k}>{l}</p>)}
          </div>
          <div className="animate-fade-up delay-2 flex flex-wrap items-center gap-3">
            <Link href={HERO.cta!.primary.href} className="brut-btn brut-btn-primary brut-btn-arrow min-h-[54px] px-6">
              {HERO.cta!.primary.label}
            </Link>
          </div>
        </div>
      </section>

      {/* Sections: a numbered step, one large phrase, quiet copy, hairlines between. */}
      {SECTIONS.map((s, i) => (
        <section key={i} className="border-t border-rule px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className={`reveal flex flex-col ${i % 2 === 1 ? "lg:order-2" : ""}`}>
            <div className="flex items-center gap-3">
              <span className="number-badge">{String(i + 1).padStart(2, "0")}.</span>
              <p className="screen-eyebrow">{s.eyebrow}</p>
            </div>
            <h2 className="headline headline-arrow mt-6 max-w-full break-words text-6xl sm:text-7xl xl:text-8xl">{s.title}</h2>
            <div className="mt-8 max-w-xl space-y-1 border-t border-rule pt-6 text-base leading-relaxed text-muted sm:text-lg">
              {s.lines.map((l, k) => <p key={k}>{l}</p>)}
            </div>
            {s.cta && (
              <div className="mt-10">
                <Link href={s.cta.primary.href} className="brut-btn brut-btn-accent brut-btn-arrow min-h-[54px] px-6">
                  {s.cta.primary.label}
                </Link>
              </div>
            )}
          </div>
          {s.visual && <div className="reveal">{s.visual}</div>}
          </div>
        </section>
      ))}

      <AppShowcase />

      <section className="border-t border-rule px-5 py-20 sm:px-8 sm:py-28">
        <div className="reveal mx-auto flex max-w-6xl flex-col items-start gap-8 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="headline max-w-3xl text-5xl sm:text-7xl">
            Ask the sky your <span className="text-accent">first question.</span>
          </h2>
          <Link href="/signup" className="brut-btn brut-btn-accent brut-btn-arrow min-h-[54px] shrink-0 px-6">
            Get your reading
          </Link>
        </div>
      </section>

      <footer className="border-t border-rule px-5 py-8 text-xs text-muted sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <span>For guidance and reflection. Not a substitute for professional advice.</span>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-fg">Privacy</Link>
        </div>
      </footer>
    </div>
  );
}
