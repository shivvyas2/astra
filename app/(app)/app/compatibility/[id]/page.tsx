import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { getPerson } from "@/lib/profiles/store";
import { computeCompatibility, type ChartPair } from "@/lib/compat/compatibility";
import { AskAboutUs } from "@/components/AskAboutUs";
import { birthUtFrom, overTime, type StretchTone } from "@/lib/compat/overTime";
import { DateTime } from "luxon";
import { getI18n } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/config";
import {
  aspectLine,
  compatAskPrompt,
  compatSummary,
  doshaText,
  elementLine,
  kootaCategory,
  kootaName,
  kootaNote,
  planet,
  stretchReasons,
  toneText,
  verdictText,
} from "@/lib/i18n/astro";

const STRETCH_CLASS: Record<StretchTone, string> = { warm: "bg-accent", steady: "bg-fg/80", strained: "bg-ember" };

export const dynamic = "force-dynamic";

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

  const i18n = await getI18n();
  const { t, f } = i18n;
  const c = t.compat;
  const monthYear = (iso: string) => DateTime.fromISO(iso).setLocale(intlLocale(i18n.locale)).toFormat("LLL yyyy");
  const name = person.label || person.first_name;
  const groomSide = groom === "them" ? "them" : "you";
  const r = computeCompatibility({
    you: { name: me.first_name, chart: me.chart as unknown as ChartPair },
    them: { name, relationship: person.relationship, chart: person.chart as unknown as ChartPair },
    groom: groomSide,
  });
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const years = overTime(
    { name: me.first_name, chart: (me.chart as unknown as ChartPair).vedic, birthUt: birthUtFrom(String(me.birth_date), String(me.birth_time), String(me.timezone)) },
    { name, chart: (person.chart as unknown as ChartPair).vedic, birthUt: birthUtFrom(person.birth_date, person.birth_time, person.timezone) },
    new Date().toISOString().slice(0, 10),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href={`/app/profiles/${person.id}`} className="eyebrow transition-colors hover:text-fg">← {name}</Link>
        <p className="screen-eyebrow mt-5">{c.eyebrow}</p>
        <h1 className="headline headline-arrow mt-3 text-4xl sm:text-5xl">{f(c.title, { name })}</h1>

        <section className="brut-card mt-5 p-5">
          <p className="eyebrow">{c.gunaMilan}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-7xl font-light tabular-nums tracking-tight text-accent">{fmt(r.guna.total)}</span>
            <span className="text-xl font-normal text-muted">/ 36</span>
          </p>
          <p className="mt-1 text-lg font-semibold">{verdictText(i18n, r.guna.total, r.guna.verdict)}</p>
          <p className="mt-2 text-xs text-muted">
            {f(groomSide === "you" ? c.groomNoteYou : c.groomNoteThem, { name, total: fmt(r.guna.swappedTotal) })}{" "}
            <Link href={`?groom=${groomSide === "you" ? "them" : "you"}`} className="underline underline-offset-2">{c.swap}</Link>
          </p>
        </section>

        <section className="mt-5">
          <div className="flex justify-between rounded-full bg-fg px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-ink">
            <span>{c.koota}</span>
            <span>{f(c.kootaColumns, { name })}</span>
          </div>
          <ul>
            {r.guna.kootas.map((k) => (
              <li key={k.key} className="flex items-baseline justify-between gap-3 border-b border-[color:var(--muted)]/30 px-3 py-3">
                <span>
                  <span className="block">{kootaName(i18n, k)}</span>
                  <span className="block text-xs text-muted">{kootaNote(i18n, k, r.guna.kootas)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm">{fmt(k.score)} / {k.max}</span>
                  <span className="block font-mono text-[11px] text-muted">
                    {kootaCategory(i18n, k, k.you)} · {kootaCategory(i18n, k, k.them)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {r.guna.doshas.length > 0 && (
          <section className="mt-5 space-y-3">
            {r.guna.doshas.map((d) => {
              const text = doshaText(i18n, d, r.guna.kootas, name);
              return (
                <div key={d.kind} className={`brut-bordered p-3 text-sm ${d.present ? "border-ember/60 bg-ember/10" : ""}`}>
                  <p className="font-semibold">{text.title}</p>
                  <p className="mt-1 text-muted">{text.note}</p>
                  {text.exceptions.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                      {text.exceptions.map((e) => <li key={e}>{e}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <section className="brut-card mt-5 p-5">
          <p className="eyebrow">{c.western}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-light tabular-nums">{r.synastry.score0to100}</span>
            <span className="text-lg font-normal text-muted">/ 100</span>
          </p>
          <ul className="mt-3">
            {r.synastry.aspects.slice(0, 6).map((a) => (
              <li key={`${a.a}-${a.b}-${a.aspect}`} className="flex justify-between gap-3 border-b border-[color:var(--muted)]/30 py-2 text-sm">
                <span>
                  {aspectLine(i18n, a)}
                  {a.uncertain ? <span className="text-muted">{c.moonUncertain}</span> : null}
                </span>
                <span className={`shrink-0 font-mono text-xs ${TONE_CLASS[a.tone]}`}>{toneText(i18n, a.tone)} · {a.orb}°</span>
              </li>
            ))}
            {r.synastry.aspects.length === 0 && <li className="text-sm text-muted">{c.noContacts}</li>}
          </ul>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {r.synastry.elements.pairs.map((p) => (
              <li key={p.label}>{elementLine(i18n, p)}</li>
            ))}
          </ul>
        </section>

        {years.length > 0 && (
          <section className="brut-card mt-5 p-5">
            <p className="eyebrow">{c.yearsEyebrow}</p>
            <h2 className="headline mt-3 text-2xl">{c.yearsTitle}</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">{c.yearsBlurb}</p>
            <ol className="mt-4 border-t border-rule">
              {years.map((y) => (
                <li key={y.start} className="border-b border-rule py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums">{monthYear(y.start)} – {monthYear(y.end)}</span>
                    <span className={`brut-tag ${STRETCH_CLASS[y.tone]}`}>{c.stretch[y.tone]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{f(c.yearsLine, { you: planet(i18n, y.you), name, them: planet(i18n, y.them) })}</p>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {stretchReasons(i18n, y).map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        )}

        <p className="mt-5 text-sm leading-relaxed">{compatSummary(i18n, r)}</p>

        <div className="mt-5">
          <AskAboutUs prompt={compatAskPrompt(i18n, r, person.relationship)} personId={person.id} />
        </div>
      </div>
    </div>
  );
}
