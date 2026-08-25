import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Both the cookie client (@supabase/ssr) and the bearer client (supabase-js)
// are SupabaseClient instances, so callers can accept either.
export type Db = SupabaseClient;

/**
 * Pulls the JWT out of an `Authorization: Bearer <jwt>` header.
 * Returns null when absent, malformed, or a different scheme.
 */
export function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolves the caller's Supabase client for a route handler.
 *
 * Native clients send a bearer token; the returned client forwards it, so RLS
 * evaluates as that user. Web callers send cookies and fall through to the
 * existing cookie-backed client, leaving web behaviour unchanged.
 */
export async function createRouteSupabase(request: Request): Promise<Db> {
  const token = bearerTokenFrom(request);
  if (!token) return createServerSupabase();

  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
