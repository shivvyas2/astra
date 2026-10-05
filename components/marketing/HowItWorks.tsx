import Image from "next/image";

export function HowItWorks() {
  return (
    <section className="relative px-5 py-16 sm:px-6 sm:py-24 md:px-16">
      <h2 className="text-3xl font-bold tracking-tight sm:text-5xl md:text-7xl">The science<br />under the stars.</h2>
      <div className="mt-10 grid gap-8 sm:mt-12 sm:gap-10 md:grid-cols-3">
        <Stat n="9" unit="bodies" label="Sun through Ketu, with exact sign, house, degree, and retrograde state." />
        <Stat n="27" unit="nakshatras" label="Full Vedic lunar mansions, plus Lahiri ayanamsa and dasha context." />
        <Stat n="2" unit="systems" label="Switch between Vedic (sidereal) and Western (tropical) on any question." />
      </div>
      <div className="mt-10 max-w-2xl text-muted sm:mt-12">
        <p>
          Astrya computes your chart with the Swiss Ephemeris, the same astronomical engine professional
          astrologers rely on. Your birth time is converted to the exact moment in the sky over your birthplace,
          then interpreted, placement by placement, so every reading is grounded in a real chart rather than a guess.
        </p>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 -z-10 h-full w-1/2 opacity-30">
        <Image src="/images/starfield.jpg" alt="" fill className="object-cover" />
      </div>
    </section>
  );
}

function Stat({ n, unit, label }: { n: string; unit: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-5xl font-bold sm:text-7xl">{n}</span>
        <span className="text-lg text-muted sm:text-xl">{unit}</span>
      </div>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  );
}
