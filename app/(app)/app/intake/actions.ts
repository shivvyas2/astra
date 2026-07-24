"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { saveBirthProfile } from "@/lib/data/birthProfile";

export async function saveIntake(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await saveBirthProfile({
    userId: user.id,
    firstName: String(formData.get("first_name")),
    lastName: String(formData.get("last_name")),
    birthDate: String(formData.get("birth_date")),
    birthTime: String(formData.get("birth_time")),
    placeName: String(formData.get("place_name")),
    lat: Number(formData.get("lat")),
    lng: Number(formData.get("lng")),
    timezone: String(formData.get("timezone")),
  });
  redirect("/app");
}
