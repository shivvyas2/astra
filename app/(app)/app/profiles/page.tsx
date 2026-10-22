import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { listPeople } from "@/lib/profiles/store";
import { getI18n } from "@/lib/i18n/server";
import { sign } from "@/lib/i18n/astro";
import { Initials } from "@/components/PersonFields";
import { ScreenHeader } from "@/components/ScreenHeader";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const db = await createServerSupabase();
  const { people, available } = await listPeople(db);
  const i18n = await getI18n();
  const { t, f } = i18n;
  const relationship = (r: string) => (t.people.relationships as Record<string, string>)[r] ?? r;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <ScreenHeader
          eyebrow={t.people.eyebrow}
          title={t.people.title}
          arrow
          blurb={t.people.blurb}
        />

        {!available ? (
          <div className="brut-card mt-6 p-5">
            <h2 className="text-xl font-semibold tracking-tight">{t.people.soonTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.people.soonBody}</p>
          </div>
        ) : (
          <>
            <Link href="/app/profiles/new" className="brut-btn brut-btn-primary brut-btn-arrow mt-8 min-h-[54px] w-full">
              {t.people.add}
            </Link>
            {people.length === 0 ? (
              <div className="brut-card mt-6 p-5">
                <h2 className="text-xl font-semibold tracking-tight">{t.people.noneTitle}</h2>
                <p className="mt-1 text-sm text-muted">{t.people.noneBody}</p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {people.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/app/profiles/${p.id}`}
                      className="brut-card flex items-center gap-3 p-4 transition-colors hover:border-fg"
                    >
                      <Initials first={p.first_name} last={p.last_name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] font-semibold tracking-tight">{p.label}</span>
                        <span className="block truncate text-xs text-muted">
                          {[
                            p.moonSign && f(t.people.moon, { sign: sign(i18n, p.moonSign) }),
                            p.sunSign && f(t.people.sun, { sign: sign(i18n, p.sunSign) }),
                            p.birth_time_known === false && t.people.timeUnknown,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="brut-tag">{relationship(p.relationship)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
