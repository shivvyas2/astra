import { createRouteSupabase } from "@/lib/supabase/route";
import { getPlan } from "@/lib/billing/plan";
import { isMissingTable } from "@/lib/billing/consent";

export const runtime = "nodejs";

/**
 * GET /api/billing → { plan, status, productId, expiresAt, available }
 *
 * The caller's own subscription row, read under RLS. For display only — Plus
 * gates nothing. `available` is false while migration 0011 is missing.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const plan = await getPlan(supabase, user.id);
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, product_id, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = (error ? null : data) as { status?: string; product_id?: string; expires_at?: string } | null;
  return Response.json(
    {
      plan,
      status: row?.status ?? null,
      productId: row?.product_id ?? null,
      expiresAt: row?.expires_at ?? null,
      available: !(error && isMissingTable(error, "subscriptions")),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
