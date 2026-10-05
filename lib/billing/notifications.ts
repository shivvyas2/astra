import type { SubscriptionStatus } from "./apple";

/** The fields of an App Store Server Notification v2 payload this app uses. */
export type NotificationPayload = {
  notificationType?: string;
  subtype?: string;
  signedDate?: number;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

/** The fields of JWSRenewalInfoDecodedPayload this app uses. */
export type RenewalInfo = {
  gracePeriodExpiresDate?: number;
  autoRenewStatus?: number;
};

/**
 * The status a notification forces, where the transaction alone cannot say
 * it. `undefined` means "derive it from the transaction" (expiry, revocation).
 *
 * - DID_FAIL_TO_RENEW / GRACE_PERIOD: billing failed but Apple keeps service
 *   on until the grace period ends — Plus stays until then.
 * - EXPIRED, GRACE_PERIOD_EXPIRED: over.
 * - REFUND, REVOKE: taken back (the transaction also carries revocationDate).
 */
export function notificationOverride(
  payload: NotificationPayload,
  renewal: RenewalInfo | null,
): { status: SubscriptionStatus; expiresAt?: Date | null } | undefined {
  switch (payload.notificationType) {
    case "DID_FAIL_TO_RENEW":
      if (payload.subtype === "GRACE_PERIOD" && typeof renewal?.gracePeriodExpiresDate === "number") {
        return { status: "grace", expiresAt: new Date(renewal.gracePeriodExpiresDate) };
      }
      return undefined;
    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
      return { status: "expired" };
    case "REFUND":
    case "REVOKE":
      return { status: "revoked" };
    default:
      return undefined;
  }
}
