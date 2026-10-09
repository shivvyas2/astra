import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerson } from "@/lib/profiles/store";
import { approxFromTime } from "@/lib/profiles/birth";
import { RELATIONSHIP_LABEL } from "@/lib/profiles/types";
import { GRAHA_SANSKRIT, RASHI_SANSKRIT } from "@/lib/profiles/names";
import type { Chart } from "@/lib/astrology/types";
import { IntakeForm } from "@/components/IntakeForm";
import { Initials, PersonFields } from "@/components/PersonFields";
import { deletePersonAction, updatePersonAction } from "../actions";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const db = await createServerSupabase();
  const { person } = await getPerson(db, id);
  if (!person) notFound();

  const vedic = (person.chart as { vedic?: Chart } | null)?.vedic;
  const timeKnown = person.birth_time_known !== false;
  const update = updatePersonAction.bind(null, person.id);
  const remove = deletePersonAction.bind(null, person.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/app/profiles" className="eyebrow transition-colors hover:text-fg">← People</Link>
        <div className="mt-3 flex items-center gap-3">
          <Initials first={person.first_name} last={person.last_name} size={52} />
          <div className="min-w-0">
            <h1 className="headline truncate text-4xl sm:text-5xl">{person.label}</h1>
            <span className="brut-tag mt-2">{RELATIONSHIP_LABEL[person.relationship] ?? person.relationship}</span>
          </div>
        </div>
        {error && <Notice className="mt-4">{error}</Notice>}
        {saved && <Notice tone="info" className="mt-4">Saved. Their chart was recomputed.</Notice>}

        {vedic && (
          <section className="brut-card mt-5 p-5">
            <p className="eyebrow">Key placements</p>
            <dl className="mt-3 divide-y divide-[color:var(--muted)]/30">
              <Row label="Chandra (Moon)" value={RASHI_SANSKRIT[vedic.moonSign] ?? vedic.moonSign} detail={vedic.planets.find((p) => p.name === "Moon")?.nakshatra} />
              <Row label="Surya (Sun)" value={RASHI_SANSKRIT[vedic.sunSign] ?? vedic.sunSign} detail={vedic.sunSign} />
              {timeKnown ? (
                <Row label="Lagna (ascendant)" value={RASHI_SANSKRIT[vedic.ascendant.sign] ?? vedic.ascendant.sign} detail={vedic.ascendant.sign} />
              ) : (
                <Row label="Lagna (ascendant)" value="Unknown" detail="No birth time" />
              )}
              {vedic.dasha && <Row label="Mahadasha" value={GRAHA_SANSKRIT[vedic.dasha.mahadasha] ?? vedic.dasha.mahadasha} detail={`until ${vedic.dasha.mahadashaEnd.slice(0, 7)}${timeKnown ? "" : " (approx.)"}`} />}
            </dl>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="bg-fg text-left text-[11px] font-semibold uppercase tracking-widest text-ink">
                  <th className="px-2 py-1.5">Graha</th>
                  <th className="px-2 py-1.5 text-right">Sign · Nakshatra</th>
                </tr>
              </thead>
              <tbody>
                {vedic.planets.map((p) => (
                  <tr key={p.name} className="border-b border-[color:var(--muted)]/30">
                    <td className="px-2 py-2">{GRAHA_SANSKRIT[p.name] ?? p.name}{p.retrograde && !["Rahu", "Ketu"].includes(p.name) ? " ℞" : ""}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">
                      {RASHI_SANSKRIT[p.sign] ?? p.sign}
                      {p.name === "Moon" && !timeKnown ? "" : ` ${Math.floor(p.degree)}°`}
                      {p.nakshatra ? ` · ${p.nakshatra}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!timeKnown && (
              <p className="mt-3 text-xs text-muted">Birth time unknown: the ascendant and houses are left out, and the Moon&apos;s nakshatra could differ.</p>
            )}
          </section>
        )}

        <Link href={`/app/compatibility/${person.id}`} className="brut-btn brut-btn-accent brut-btn-arrow mt-5 min-h-[54px] w-full">
          Check compatibility →
        </Link>

        <details className="brut-card mt-5 p-5">
          <summary className="cursor-pointer font-semibold">Edit {person.label}&apos;s details</summary>
          <div className="mt-4">
            <IntakeForm
              action={update}
              extra={<PersonFields label={person.label} relationship={person.relationship} />}
              photo={false}
              lastNameOptional
              someoneElse
              submitLabel="Save changes"
              initial={{
                firstName: person.first_name,
                lastName: person.last_name,
                birthDate: person.birth_date,
                birthTime: String(person.birth_time).slice(0, 5),
                birthTimeKnown: timeKnown,
                birthTimeApprox: timeKnown ? null : approxFromTime(person.birth_time),
                placeName: person.place_name,
                lat: person.lat,
                lng: person.lng,
                timezone: person.timezone,
              }}
            />
          </div>
        </details>

        <form action={remove} className="mt-4">
          <button className="brut-btn brut-btn-quiet w-full py-2 text-sm text-muted">Remove {person.label}</button>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right">
        <span className="text-2xl font-medium tracking-tight">{value}</span>
        {detail && <span className="block font-mono text-[11px] text-muted">{detail}</span>}
      </dd>
    </div>
  );
}
