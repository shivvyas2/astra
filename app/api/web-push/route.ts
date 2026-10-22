import { createRouteSupabase } from "@/lib/supabase/route";

export const runtime = "nodejs";

type Subscription = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/**
 * `POST /api/web-push` saves this browser's push subscription for the
 * signed-in user; `DELETE` removes it. Mirrors /api/devices for iPhones.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sub = (await request.json().catch(() => ({}))) as Subscription;
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json({ error: "That subscription is incomplete." }, { status: 400 });
  }
  const { error } = await supabase.from("web_push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      user_id: user.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("web push subscribe error", error);
    return Response.json({ error: "Could not save this browser. Is migration 0016 applied?" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await supabase.from("web_push_subscriptions").delete().eq("endpoint", endpoint);
  return Response.json({ ok: true });
}
