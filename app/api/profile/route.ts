import { createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { saveBirthProfile } from "@/lib/data/birthProfile";

// swisseph-wasm runs during chart computation inside saveBirthProfile.
export const runtime = "nodejs";

const REQUIRED = [
  "first_name",
  "last_name",
  "birth_date",
  "birth_time",
  "place_name",
  "lat",
  "lng",
  "timezone",
] as const;

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

  for (const field of REQUIRED) {
    const value = form.get(field);
    if (typeof value !== "string" || value.trim() === "") {
      return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng must be numbers" }, { status: 400 });
  }

  let avatarUrl: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0 && photo.type.startsWith("image/")) {
    avatarUrl = await uploadAvatar(user.id, photo);
  }

  try {
    await saveBirthProfile(
      {
        userId: user.id,
        firstName: String(form.get("first_name")),
        lastName: String(form.get("last_name")),
        birthDate: String(form.get("birth_date")),
        birthTime: String(form.get("birth_time")),
        placeName: String(form.get("place_name")),
        lat,
        lng,
        timezone: String(form.get("timezone")),
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
