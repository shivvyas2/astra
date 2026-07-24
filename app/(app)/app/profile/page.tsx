import { redirect } from "next/navigation";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "../intake/actions";

export default async function ProfilePage() {
  const p = await getBirthProfile();
  if (!p) redirect("/app/intake");

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center overflow-y-auto px-5 py-5">
      <div className="mb-4 text-center">
        <h1 className="text-xl font-light tracking-tight sm:text-2xl">Your profile</h1>
        <p className="mt-1 text-xs text-muted">Update your details or photo. Changing your birth data recomputes your chart.</p>
      </div>
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
  );
}
