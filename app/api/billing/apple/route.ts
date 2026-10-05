import { createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AppleJwsError, verifyTransaction } from "@/lib/billing/apple";
import { linkTransaction } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";

/**
 * POST /api/billing/apple  { signedTransaction: "<JWS>" }
 *
 * The iPhone posts each StoreKit 2 transaction it sees — after a purchase, a
 * restore, a `Transaction.updates` event, and its current entitlement at
 * launch. The JWS is verified here against the pinned Apple Root CA - G3
 * (lib/billing/apple.ts), checked for this bundle id and an Astrya Plus
 * product, and only then written to `subscriptions` with the service role.
 * Nothing the client says about the purchase is trusted beyond the signature.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: { signedTransaction?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.signedTransaction !== "string" || body.signedTransaction.length > 20_000) {
    return Response.json({ error: "signedTransaction is required" }, { status: 400 });
  }

  let tx;
  try {
    tx = verifyTransaction(body.signedTransaction);
  } catch (err) {
    if (err instanceof AppleJwsError) {
      // Includes Xcode's local StoreKit testing, which signs with a local
      // certificate rather than Apple's.
      console.warn("billing: rejected transaction", err.reason);
      return Response.json({ error: "invalid_transaction", reason: err.reason }, { status: 400 });
    }
    console.error("billing: verify error", err);
    return Response.json({ error: "Could not check that purchase." }, { status: 500 });
  }

  const result = await linkTransaction(createAdminSupabase(), user.id, tx);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(
    {
      plan: result.row.plan,
      status: result.row.status,
      productId: result.row.product_id,
      expiresAt: result.row.expires_at,
      stored: result.stored,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
