import { createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { cleanZone } from "@/lib/alerts/zones";
import { isMissingRelation } from "@/lib/usage/record";

export const runtime = "nodejs";

// APNs device tokens are hex. Length has grown over the years, so this checks
// the alphabet and a sane range rather than pinning 64 characters.
const TOKEN_PATTERN = /^[0-9a-fA-F]{64,200}$/;

/**
 * Registers this device for pushes, with the phone's own timezone so the
 * morning and night readings follow the clock the person actually lives on.
 *
 * The row is written with the admin client: a device handed from one account to
 * another has to change owner, and the owner-only RLS policy would (correctly)
 * refuse that update. The user id still comes from the verified session, never
 * from the body.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { token?: string; environment?: string; timezone?: string }
    | null;
  const token = body?.token?.trim();
  if (!token || !TOKEN_PATTERN.test(token)) {
    return Response.json({ error: "Invalid device token" }, { status: 400 });
  }
  const environment = body?.environment === "sandbox" ? "sandbox" : "production";
  const timezone = cleanZone(body?.timezone);

  const admin = createAdminSupabase();
  const row = {
    token,
    user_id: user.id,
    platform: "ios",
    environment,
    updated_at: new Date().toISOString(),
  };
  let { error } = await admin.from("device_tokens").upsert({ ...row, timezone }, { onConflict: "token" });
  // Before migration 0013 the column does not exist; register without it
  // rather than refuse the device.
  if (error && isMissingRelation(error)) {
    ({ error } = await admin.from("device_tokens").upsert(row, { onConflict: "token" }));
  }
  if (error) {
    console.error("device registration error", error);
    return Response.json({ error: "Could not register this device." }, { status: 500 });
  }

  return Response.json({ ok: true });
}

/** Unregisters a device — on sign-out, or when the user turns alerts off. */
export async function DELETE(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token) return Response.json({ error: "Missing token" }, { status: 400 });

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("device_tokens")
    .delete()
    .eq("token", token)
    .eq("user_id", user.id);
  if (error) {
    console.error("device removal error", error);
    return Response.json({ error: "Could not remove this device." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
