"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { saveBirthProfile } from "@/lib/data/birthProfile";
import { parseBirthFields } from "@/lib/profiles/birth";
import { languageForLocale } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";

async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const admin = createAdminSupabase();
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) return null;
  const { data } = admin.storage.from("avatars").getPublicUrl(path);
  // cache-bust so a replaced photo shows immediately
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function saveIntake(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The same checks `POST /api/profile` runs, including the unknown-time path.
  const parsed = parseBirthFields(formData);
  if (!parsed.ok) throw new Error(parsed.error);
  const birth = parsed.value;

  let avatarUrl: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0 && photo.type.startsWith("image/")) {
    avatarUrl = await uploadAvatar(user.id, photo);
  }

  // A first profile starts in English (the column's default). Someone who
  // has been using the site in Hindi or Gujarati (their cookie, or their
  // browser's language) keeps it. Read before saving, while nothing is stored.
  const { data: existing } = await supabase.from("birth_profiles").select("user_id").maybeSingle();
  const chosen = await getLocale();

  await saveBirthProfile({
    userId: user.id,
    firstName: birth.firstName,
    lastName: birth.lastName,
    birthDate: birth.birthDate,
    birthTime: birth.birthTime,
    birthTimeKnown: birth.birthTimeKnown,
    placeName: birth.placeName,
    lat: birth.lat,
    lng: birth.lng,
    timezone: birth.timezone,
    avatarUrl,
  });
  if (!existing && chosen !== "en") {
    const { error } = await supabase
      .from("birth_profiles")
      .update({ reading_language: languageForLocale(chosen) })
      .eq("user_id", user.id);
    if (error) console.error("first profile language not saved", error);
  }
  redirect("/app");
}
