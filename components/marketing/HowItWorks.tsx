import Image from "next/image";
import { getI18n } from "@/lib/i18n/server";

export async function HowItWorks() {
  const { t } = await getI18n();
  const l = t.landing;
  return (
    <section className="relative px-5 py-16 sm:px-6 sm:py-24 md:px-16">
      <h2 className="text-3xl font-bold tracking-tight sm:text-5xl md:text-7xl">{l.howTitle}</h2>
      <div className="mt-10 grid gap-8 sm:mt-12 sm:gap-10 md:grid-cols-3">
        <Stat n="9" unit={l.howBodies} label={l.howBodiesLabel} />
        <Stat n="27" unit={l.howNakshatras} label={l.howNakshatrasLabel} />
        <Stat n="2" unit={l.howSystems} label={l.howSystemsLabel} />
      </div>
      <div className="mt-10 max-w-2xl text-muted sm:mt-12">
        <p>{l.howBody}</p>
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
