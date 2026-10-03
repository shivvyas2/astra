import { redirect } from "next/navigation";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "../intake/actions";

export default async function ProfilePage() {
  const p = await getBirthProfile();
  if (!p) redirect("/app/intake");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-8">
        <div className="mb-5">
          <p className="eyebrow">Account</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Your profile</h1>
          <p className="mt-2 text-sm text-muted">Update your details or photo. Changing your birth data recomputes your chart.</p>
          <a href="/api/kundli" className="brut-btn brut-btn-secondary mt-4 px-3 py-2 text-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Download kundli (PDF)
          </a>
        </div>
        <div className="brut-card p-5">
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
              avatarUrl: p.avatar_url,
            }}
          />
        </div>
      </div>
    </div>
  );
}
