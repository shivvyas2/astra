import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Bypasses RLS. Only ever import from server code behind an admin auth check.
export function createAdminSupabase() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
