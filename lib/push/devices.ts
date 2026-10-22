import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApnsClient, isPushConfigured, type PushEnvironment, type PushPayloadArgs } from "./apns";
import { pushToWebSubscriptions } from "./web";

/**
 * Sends one notification to every device a user has registered, iPhones and
 * browsers alike, and drops the tokens reported as dead. Apple only says a
 * token is gone when you use it, so this is where the table stays clean.
 * Returns how many were sent; each half is skipped when it is not configured.
 */
export async function pushToUserDevices(
  admin: SupabaseClient,
  apns: ApnsClient,
  userId: string,
  payload: PushPayloadArgs,
): Promise<number> {
  const web = (await pushToWebSubscriptions(admin, userId, payload)).filter((r) => r.ok).length;
  if (!isPushConfigured()) return web;

  const { data } = await admin.from("device_tokens").select("token, environment").eq("user_id", userId);

  let sent = 0;
  const dead: string[] = [];
  for (const device of (data ?? []) as { token: string; environment: PushEnvironment }[]) {
    let result = await apns.send({ deviceToken: device.token, environment: device.environment, ...payload });
    // A token sent to the wrong host comes back BadDeviceToken, which is not
    // the same as dead: an App Store build that once reported "sandbox" did
    // exactly this. Try the other host once, and remember it if it works.
    if (!result.ok && result.reason === "BadDeviceToken") {
      const other: PushEnvironment = device.environment === "sandbox" ? "production" : "sandbox";
      const retry = await apns.send({ deviceToken: device.token, environment: other, ...payload });
      if (retry.ok) {
        await admin.from("device_tokens").update({ environment: other }).eq("token", device.token);
      }
      result = retry;
    }
    if (result.ok) sent += 1;
    else if (result.unregistered) dead.push(device.token);
    else console.error("apns send failed", result.status, result.reason);
  }
  if (dead.length > 0) await admin.from("device_tokens").delete().in("token", dead);
  return sent + web;
}
