"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { saveBirthProfile } from "@/lib/data/birthProfile";

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

  let avatarUrl: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0 && photo.type.startsWith("image/")) {
    avatarUrl = await uploadAvatar(user.id, photo);
  }

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
    avatarUrl,
  });
  redirect("/app");
}
