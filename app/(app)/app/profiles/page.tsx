import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { listPeople } from "@/lib/profiles/store";
import { RELATIONSHIP_LABEL } from "@/lib/profiles/types";
import { Initials } from "@/components/PersonFields";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const db = await createServerSupabase();
  const { people, available } = await listPeople(db);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <p className="eyebrow">People</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">The people in your chart</h1>
        <p className="mt-2 text-sm text-muted">
          Save a partner, a parent or a friend, and see how your charts meet: the 36-point Guna Milan and Western synastry.
        </p>

        {!available ? (
          <div className="brut-card mt-6 p-5">
            <h2 className="text-lg font-black">Coming very soon</h2>
            <p className="mt-1 text-sm text-muted">Saving other people isn&apos;t switched on yet. Check back shortly.</p>
          </div>
        ) : (
          <>
            <Link href="/app/profiles/new" className="brut-btn brut-btn-primary mt-6 w-full py-3">
              Add someone
            </Link>
            {people.length === 0 ? (
              <div className="brut-card mt-6 p-5">
                <h2 className="text-lg font-black">No one yet</h2>
                <p className="mt-1 text-sm text-muted">
                  Add someone with their birth date and place. The time helps, but you can leave it out.
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {people.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/app/profiles/${p.id}`}
                      className="brut-card flex items-center gap-3 p-4 transition-colors hover:bg-surface-raised"
                    >
                      <Initials first={p.first_name} last={p.last_name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-black">{p.label}</span>
                        <span className="block truncate text-xs text-muted">
                          {[p.moonSign && `Moon ${p.moonSign}`, p.sunSign && `Sun ${p.sunSign}`].filter(Boolean).join(" · ")}
                          {p.birth_time_known === false ? " · time unknown" : ""}
                        </span>
                      </span>
                      <span className="brut-tag">{RELATIONSHIP_LABEL[p.relationship] ?? p.relationship}</span>
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
