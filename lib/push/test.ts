import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApnsClient, isPushConfigured, type PushEnvironment } from "./apns";

export type TestAttempt = { environment: PushEnvironment; ok: boolean; status: number; reason?: string };

export type DeviceTest = {
  /** The last 8 characters only: enough to tell two phones apart. */
  tokenTail: string;
  stored: PushEnvironment;
  registeredAt: string;
  attempts: TestAttempt[];
  delivered: boolean;
};

export type PushTestReport = {
  configured: boolean;
  devices: DeviceTest[];
};

/**
 * Sends a test notification to every device one user has registered and
 * reports what Apple answered for each, so a missing push can be diagnosed
 * from the phone. A token Apple rejects on its stored host is tried on the
 * other, and the host that works is stored. Nothing is deleted: this is a
 * diagnosis, and a token that fails here may only be on the wrong host.
 */
export async function sendTestPush(admin: SupabaseClient, userId: string): Promise<PushTestReport> {
  if (!isPushConfigured()) return { configured: false, devices: [] };

  const { data, error } = await admin
    .from("device_tokens")
    .select("token, environment, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const apns = new ApnsClient();
  const devices: DeviceTest[] = [];
  try {
    for (const row of (data ?? []) as { token: string; environment: PushEnvironment; updated_at: string }[]) {
      const payload = {
        title: "Test notification",
        body: "If you can read this on your lock screen, Astrya's notifications work on this phone.",
        alertId: "test",
        threadId: "sanchara-test",
      };
      const attempts: TestAttempt[] = [];
      const first = await apns.send({ deviceToken: row.token, environment: row.environment, ...payload });
      attempts.push({ environment: row.environment, ok: first.ok, status: first.status, reason: first.reason });
      let delivered = first.ok;
      if (!first.ok && first.reason === "BadDeviceToken") {
        const other: PushEnvironment = row.environment === "sandbox" ? "production" : "sandbox";
        const second = await apns.send({ deviceToken: row.token, environment: other, ...payload });
        attempts.push({ environment: other, ok: second.ok, status: second.status, reason: second.reason });
        if (second.ok) {
          delivered = true;
          await admin.from("device_tokens").update({ environment: other }).eq("token", row.token);
        }
      }
      devices.push({
        tokenTail: row.token.slice(-8),
        stored: row.environment,
        registeredAt: row.updated_at,
        attempts,
        delivered,
      });
    }
  } finally {
    apns.close();
  }
  return { configured: true, devices };
}
