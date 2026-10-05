import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApnsClient, isPushConfigured, type PushEnvironment, type PushPayloadArgs } from "./apns";

/**
 * Sends one notification to every device a user has registered, and drops
 * the tokens Apple reports as dead. Apple only says a token is gone when you
 * use it, so this is where the table stays clean. Returns how many were sent;
 * 0 when APNs is not configured.
 */
export async function pushToUserDevices(
  admin: SupabaseClient,
  apns: ApnsClient,
  userId: string,
  payload: PushPayloadArgs,
): Promise<number> {
  if (!isPushConfigured()) return 0;

  const { data } = await admin.from("device_tokens").select("token, environment").eq("user_id", userId);

  let sent = 0;
  const dead: string[] = [];
  for (const device of (data ?? []) as { token: string; environment: PushEnvironment }[]) {
    const result = await apns.send({ deviceToken: device.token, environment: device.environment, ...payload });
    if (result.ok) sent += 1;
    else if (result.unregistered) dead.push(device.token);
    else console.error("apns send failed", result.status, result.reason);
  }
  if (dead.length > 0) await admin.from("device_tokens").delete().in("token", dead);
  return sent;
}
