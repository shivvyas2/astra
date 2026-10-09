import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { getPerson } from "@/lib/profiles/store";
import { computeCompatibility, type ChartPair, type KootaForClient } from "@/lib/compat/compatibility";
import { GRAHA_SANSKRIT, RASHI_SANSKRIT } from "@/lib/profiles/names";
import { AskAboutUs } from "@/components/AskAboutUs";

export const dynamic = "force-dynamic";

/** Graha Maitri and Bhakoot carry graha and rashi names; show them in Sanskrit with the English beneath. */
function categoryText(k: KootaForClient, value: string): string {
  if (k.key === "maitri") return GRAHA_SANSKRIT[value] ?? value;
  if (k.key === "bhakoot") return RASHI_SANSKRIT[value] ?? value;
  return value;
}

const TONE_CLASS = { harmonious: "text-fg", challenging: "text-ember", intense: "text-accent" } as const;

export default async function CompatibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ groom?: string }>;
}) {
  const { id } = await params;
  const { groom } = await searchParams;
  const me = await getBirthProfile();
  if (!me?.chart) redirect("/app/intake");
  const db = await createServerSupabase();
  const { person } = await getPerson(db, id);
  if (!person?.chart) notFound();

  const name = person.label || person.first_name;
  const groomSide = groom === "them" ? "them" : "you";
  const r = computeCompatibility({
    you: { name: me.first_name, chart: me.chart as unknown as ChartPair },
    them: { name, relationship: person.relationship, chart: person.chart as unknown as ChartPair },
    groom: groomSide,
  });
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href={`/app/profiles/${person.id}`} className="eyebrow transition-colors hover:text-fg">← {name}</Link>
        <p className="screen-eyebrow mt-5">Compatibility</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">You &amp; {name}</h1>

        <section className="brut-card mt-5 p-5">
          <p className="eyebrow">Guna Milan</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-7xl font-light tabular-nums tracking-tight text-accent">{fmt(r.guna.total)}</span>
            <span className="text-xl font-normal text-muted">/ 36</span>
          </p>
          <p className="mt-1 text-lg font-semibold">{r.guna.verdict}</p>
          <p className="mt-2 text-xs text-muted">
            The classical tables read one chart as the groom&apos;s and one as the bride&apos;s. Read with{" "}
            {groomSide === "you" ? "you" : name} as the groom&apos;s; the other way round it is {fmt(r.guna.swappedTotal)}.{" "}
            <Link href={`?groom=${groomSide === "you" ? "them" : "you"}`} className="underline underline-offset-2">Swap</Link>
          </p>
        </section>

        <section className="mt-5">
          <div className="flex justify-between rounded-full bg-fg px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-ink">
            <span>Koota</span>
            <span>You · {name} · Points</span>
          </div>
          <ul>
            {r.guna.kootas.map((k) => (
              <li key={k.key} className="flex items-baseline justify-between gap-3 border-b border-[color:var(--muted)]/30 px-3 py-3">
                <span>
                  <span className="block">{k.name}</span>
                  <span className="block text-xs text-muted">{k.note}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm">{fmt(k.score)} / {k.max}</span>
                  <span className="block font-mono text-[11px] text-muted">
                    {categoryText(k, k.you)} · {categoryText(k, k.them)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {r.guna.doshas.length > 0 && (
          <section className="mt-5 space-y-3">
            {r.guna.doshas.map((d) => (
              <div key={d.kind} className={`brut-bordered p-3 text-sm ${d.present ? "border-ember/60 bg-ember/10" : ""}`}>
                <p className="font-semibold">
                  {d.kind === "nadi" ? "Nadi dosha" : d.kind === "bhakoot" ? "Bhakoot dosha" : "Mangal dosha"}
                  {d.present ? "" : " — none"}
                </p>
                <p className="mt-1 text-muted">{d.note}</p>
                {d.exceptions.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                    {d.exceptions.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        <section className="brut-card mt-5 p-5">
          <p className="eyebrow">Western synastry</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-light tabular-nums">{r.synastry.score0to100}</span>
            <span className="text-lg font-normal text-muted">/ 100</span>
          </p>
          <ul className="mt-3">
            {r.synastry.aspects.slice(0, 6).map((a) => (
              <li key={`${a.a}-${a.b}-${a.aspect}`} className="flex justify-between gap-3 border-b border-[color:var(--muted)]/30 py-2 text-sm">
                <span>
                  Your {a.a} {a.aspect} their {a.b}
                  {a.uncertain ? <span className="text-muted"> (Moon uncertain)</span> : null}
                </span>
                <span className={`font-mono text-xs ${TONE_CLASS[a.tone]}`}>{a.tone} · {a.orb}°</span>
              </li>
            ))}
            {r.synastry.aspects.length === 0 && <li className="text-sm text-muted">No close contacts between the five points.</li>}
          </ul>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {r.synastry.elements.pairs.map((p) => (
              <li key={p.label}>Your {p.label.split(" and ")[0]} ({p.a}) and their {p.label.split(" and ")[1]} ({p.b}): {p.relation}</li>
            ))}
          </ul>
        </section>

        <p className="mt-5 text-sm leading-relaxed">{r.summary}</p>

        <div className="mt-5">
          <AskAboutUs prompt={r.askPrompt} />
        </div>
      </div>
    </div>
  );
}
