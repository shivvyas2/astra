import { redirect } from "next/navigation";
import { getBirthProfile, timeKnownOf } from "@/lib/data/birthProfile";
import { approxFromTime } from "@/lib/profiles/birth";
import { IntakeForm } from "@/components/IntakeForm";
import { KnowledgeList } from "@/components/KnowledgeList";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadFacts } from "@/lib/facts/store";
import { loadMemories, loadPredictions } from "@/lib/memory/store";
import { saveIntake } from "../intake/actions";
import { ScreenHeader } from "@/components/ScreenHeader";

export default async function ProfilePage() {
  const p = await getBirthProfile();
  if (!p) redirect("/app/intake");
  // None of these throw: no table yet, or a failed read, is an empty list.
  const db = await createServerSupabase();
  const [{ facts }, { memories }, { predictions }] = await Promise.all([
    loadFacts(db, 100),
    loadMemories(db, 50),
    loadPredictions(db, 100),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-8">
        <div className="mb-8">
          <ScreenHeader
            eyebrow="Account"
            title="Your profile"
            arrow
            blurb="Update your details or photo. Changing your birth data recomputes your chart."
          />
          <a href="/api/kundli" className="brut-btn brut-btn-secondary mt-5 px-4 py-2.5 text-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Download kundli (PDF)
          </a>
        </div>
        <div className="brut-card p-5 sm:p-6">
          <IntakeForm
            action={saveIntake}
            initial={{
              firstName: p.first_name,
              lastName: p.last_name,
              birthDate: p.birth_date,
              birthTime: String(p.birth_time).slice(0, 5),
              placeName: p.place_name,
              lat: p.lat,
              lng: p.lng,
              timezone: p.timezone,
              birthTimeKnown: timeKnownOf(p),
              birthTimeApprox: timeKnownOf(p) ? null : approxFromTime(p.birth_time),
              avatarUrl: p.avatar_url,
            }}
          />
        </div>
        <KnowledgeList initial={facts} summaries={memories} predictions={predictions} />
      </div>
    </div>
  );
}
