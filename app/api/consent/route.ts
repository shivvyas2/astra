import { cookies } from "next/headers";
import { createRouteSupabase } from "@/lib/supabase/route";
import {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  isConsentPlatform,
  readConsent,
  recordConsent,
  withdrawConsent,
} from "@/lib/billing/consent";

export const runtime = "nodejs";

/**
 * Consent to send personal data to Anthropic for readings.
 *
 * GET    → { accepted, version, currentVersion, stored }
 * POST   { version, platform } → records agreement to that version
 * DELETE → withdraws it (the app shows the notice again)
 *
 * `stored` is false while migration 0011 has not been applied: the server can
 * neither record nor enforce consent then, and clients rely on their own
 * record (the iPhone's local store; on the web, a cookie set here).
 */

export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const state = await readConsent(supabase, user.id);
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: { version?: unknown; platform?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Only the notice the server is currently showing can be agreed to: an old
  // app agreeing to an old notice should be asked again with the new one.
  if (body.version !== CONSENT_VERSION) {
    return Response.json({ error: "stale_version", currentVersion: CONSENT_VERSION }, { status: 409 });
  }
  if (!isConsentPlatform(body.platform)) {
    return Response.json({ error: "platform must be 'ios' or 'web'" }, { status: 400 });
  }

  const result = await recordConsent(supabase, user.id, CONSENT_VERSION, body.platform);
  if (!result.ok) return Response.json({ error: "Could not save that. Please try again." }, { status: 500 });

  if (!result.stored && body.platform === "web") await setWebCookie(CONSENT_VERSION);
  return Response.json(
    { accepted: true, version: CONSENT_VERSION, currentVersion: CONSENT_VERSION, stored: result.stored },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const result = await withdrawConsent(supabase, user.id);
  if (!result.ok) return Response.json({ error: "Could not withdraw that. Please try again." }, { status: 500 });
  await setWebCookie(null);
  return Response.json({ accepted: false, version: null, currentVersion: CONSENT_VERSION });
}

async function setWebCookie(version: string | null) {
  try {
    const jar = await cookies();
    if (version) {
      jar.set(CONSENT_COOKIE, version, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    } else {
      jar.delete(CONSENT_COOKIE);
    }
  } catch {
    // Outside a request scope (tests): nothing to set.
  }
}
