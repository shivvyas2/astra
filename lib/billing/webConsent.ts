import "server-only";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { CONSENT_COOKIE, CONSENT_VERSION, readConsent } from "./consent";

/**
 * Whether the signed-in web user has agreed to the current AI consent
 * notice. The database is the record; while ai_consents does not exist (0011
 * not applied) the cookie POST /api/consent set stands in for it.
 */
export async function webConsentAccepted(): Promise<boolean> {
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  // Signed out: the middleware redirects; nothing to ask.
  if (!user) return true;
  const state = await readConsent(db, user.id);
  if (state.stored) return state.accepted;
  const jar = await cookies();
  return jar.get(CONSENT_COOKIE)?.value === CONSENT_VERSION;
}
