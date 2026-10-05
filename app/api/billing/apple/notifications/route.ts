import { createAdminSupabase } from "@/lib/supabase/admin";
import { AppleJwsError, BUNDLE_ID, verifyAppleJws, verifyTransaction } from "@/lib/billing/apple";
import { applyNotification } from "@/lib/billing/subscriptions";
import { notificationOverride, type NotificationPayload, type RenewalInfo } from "@/lib/billing/notifications";

export const runtime = "nodejs";

/**
 * App Store Server Notifications v2. Set this URL (https://<domain>/api/billing/apple/notifications)
 * for both Production and Sandbox in App Store Connect → App Information.
 *
 * The body is `{ signedPayload }`, a JWS verified exactly like a transaction.
 * Renewals, billing-grace, expiry, refunds and revocations update the row for
 * the purchase's original transaction id. A verified notification is always
 * answered 200 (even when no account holds that purchase yet), otherwise
 * Apple retries it for days; a forged or malformed one gets 400.
 */
export async function POST(request: Request) {
  let body: { signedPayload?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.signedPayload !== "string") return Response.json({ error: "signedPayload required" }, { status: 400 });

  try {
    const payload = verifyAppleJws<NotificationPayload>(body.signedPayload);
    if (payload.data?.bundleId !== BUNDLE_ID) throw new AppleJwsError("wrong bundle id");
    if (payload.notificationType === "TEST" || !payload.data?.signedTransactionInfo) {
      return Response.json({ ok: true, applied: false });
    }
    const tx = verifyTransaction(payload.data.signedTransactionInfo);
    const renewal = payload.data.signedRenewalInfo
      ? verifyAppleJws<RenewalInfo>(payload.data.signedRenewalInfo)
      : null;
    const result = await applyNotification(createAdminSupabase(), tx, notificationOverride(payload, renewal));
    console.log(`billing notification ${payload.notificationType}/${payload.subtype ?? "-"} applied=${result.applied}`);
    return Response.json({ ok: true, applied: result.applied });
  } catch (err) {
    if (err instanceof AppleJwsError) {
      console.warn("billing notification rejected", err.reason);
      return Response.json({ error: "invalid_notification" }, { status: 400 });
    }
    console.error("billing notification error", err);
    // 500 so Apple retries a database hiccup.
    return Response.json({ error: "temporarily unavailable" }, { status: 500 });
  }
}
