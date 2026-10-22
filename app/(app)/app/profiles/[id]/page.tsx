import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerson } from "@/lib/profiles/store";
import { approxFromTime } from "@/lib/profiles/birth";
import { getI18n } from "@/lib/i18n/server";
import { nakshatra, vedicPlanet, vedicSign } from "@/lib/i18n/astro";
import type { Chart } from "@/lib/astrology/types";
import { IntakeForm } from "@/components/IntakeForm";
import { Initials, PersonFields } from "@/components/PersonFields";
import { deletePersonAction, updatePersonAction } from "../actions";
import { Notice } from "@/components/Notice";
import { formError } from "../errors";

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
  const i18n = await getI18n();
  const { t, f, locale } = i18n;
  const en = locale === "en";
  const relationship = (t.people.relationships as Record<string, string>)[person.relationship] ?? person.relationship;

  const vedic = (person.chart as { vedic?: Chart } | null)?.vedic;
  const timeKnown = person.birth_time_known !== false;
  const update = updatePersonAction.bind(null, person.id);
  const remove = deletePersonAction.bind(null, person.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/app/profiles" className="eyebrow transition-colors hover:text-fg">{t.people.back}</Link>
        <div className="mt-3 flex items-center gap-3">
          <Initials first={person.first_name} last={person.last_name} size={52} />
          <div className="min-w-0">
            <h1 className="headline truncate text-4xl sm:text-5xl">{person.label}</h1>
            <span className="brut-tag mt-2">{relationship}</span>
          </div>
        </div>
        {error && <Notice className="mt-4">{formError(i18n, error)}</Notice>}
        {saved && <Notice tone="info" className="mt-4">{t.person.saved}</Notice>}

        {vedic && (
          <section className="brut-card mt-5 p-5">
            <p className="eyebrow">{t.person.keyPlacements}</p>
            {/* In English the Sanskrit name leads and the English sign sits beneath; in Hindi and Gujarati the sign's own name says both. */}
            <dl className="mt-3 divide-y divide-[color:var(--muted)]/30">
              <Row
                label={t.person.moon}
                value={vedicSign(i18n, vedic.moonSign)}
                detail={(() => {
                  const n = vedic.planets.find((p) => p.name === "Moon")?.nakshatra;
                  return n ? nakshatra(i18n, n) : undefined;
                })()}
              />
              <Row label={t.person.sun} value={vedicSign(i18n, vedic.sunSign)} detail={en ? vedic.sunSign : undefined} />
              {timeKnown ? (
                <Row label={t.person.lagna} value={vedicSign(i18n, vedic.ascendant.sign)} detail={en ? vedic.ascendant.sign : undefined} />
              ) : (
                <Row label={t.person.lagna} value={t.person.unknown} detail={t.person.noBirthTime} />
              )}
              {vedic.dasha && (
                <Row
                  label={t.person.mahadasha}
                  value={vedicPlanet(i18n, vedic.dasha.mahadasha)}
                  detail={
                    f(t.person.until, {
                      date: en ? vedic.dasha.mahadashaEnd.slice(0, 7) : i18n.date(`${vedic.dasha.mahadashaEnd.slice(0, 10)}T12:00:00Z`, { month: "short", year: "numeric", timeZone: "UTC" }),
                    }) + (timeKnown ? "" : t.person.approx)
                  }
                />
              )}
            </dl>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="bg-fg text-left text-[11px] font-semibold uppercase tracking-widest text-ink">
                  <th className="px-2 py-1.5">{t.person.graha}</th>
                  <th className="px-2 py-1.5 text-right">{t.person.signNakshatra}</th>
                </tr>
              </thead>
              <tbody>
                {vedic.planets.map((p) => (
                  <tr key={p.name} className="border-b border-[color:var(--muted)]/30">
                    <td className="px-2 py-2">{vedicPlanet(i18n, p.name)}{p.retrograde && !["Rahu", "Ketu"].includes(p.name) ? " ℞" : ""}</td>
                    <td className={`px-2 py-2 text-right text-xs ${en ? "font-mono" : ""}`}>
                      {vedicSign(i18n, p.sign)}
                      {p.name === "Moon" && !timeKnown ? "" : ` ${Math.floor(p.degree)}°`}
                      {p.nakshatra ? ` · ${nakshatra(i18n, p.nakshatra)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!timeKnown && (
              <p className="mt-3 text-xs text-muted">{t.person.timeNote}</p>
            )}
          </section>
        )}

        <Link href={`/app/compatibility/${person.id}`} className="brut-btn brut-btn-accent brut-btn-arrow mt-5 min-h-[54px] w-full">
          {t.person.checkCompat}
        </Link>

        <details className="brut-card mt-5 p-5">
          <summary className="cursor-pointer font-semibold">{f(t.person.edit, { name: person.label })}</summary>
          <div className="mt-4">
            <IntakeForm
              action={update}
              extra={<PersonFields label={person.label} relationship={person.relationship} />}
              photo={false}
              lastNameOptional
              someoneElse
              submitLabel={t.person.saveChanges}
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
          <button className="brut-btn brut-btn-quiet w-full py-2 text-sm text-muted">{f(t.person.remove, { name: person.label })}</button>
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
