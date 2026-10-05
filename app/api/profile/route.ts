import { createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { saveBirthProfile } from "@/lib/data/birthProfile";
import { parseBirthFields } from "@/lib/profiles/birth";

// swisseph-wasm runs during chart computation inside saveBirthProfile.
export const runtime = "nodejs";

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

/**
 * Birth-detail intake for native clients.
 *
 * The web app does this through the `saveIntake` server action, which a native
 * client cannot invoke. This route performs the same work and returns JSON
 * instead of redirecting.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const form = await request.formData();

  // Shared with the web intake and saved people. `birth_time_known=false`
  // makes `birth_time` optional (noon, or the rough part of day chosen).
  const parsed = parseBirthFields(form);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const birth = parsed.value;

  let avatarUrl: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0 && photo.type.startsWith("image/")) {
    avatarUrl = await uploadAvatar(user.id, photo);
  }

  try {
    await saveBirthProfile(
      {
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
      },
      supabase,
    );
  } catch (err) {
    console.error("profile save error", err);
    return Response.json({ error: "Could not compute your chart. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
