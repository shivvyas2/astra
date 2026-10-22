import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { env } from "@/lib/env";
import type { PushPayloadArgs } from "./apns";

export function isWebPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey() && env.vapidPrivateKey());
}

/** What the service worker (public/sw.js) reads to show a notification. */
export function buildWebPayload(args: PushPayloadArgs): string {
  return JSON.stringify({
    title: args.title,
    body: args.body,
    tag: args.threadId ?? "astrya",
    url: "/app/today",
  });
}

export type WebSendResult = { endpointHost: string; ok: boolean; status: number };

/**
 * Sends one notification to every browser a user has subscribed, and drops
 * the subscriptions the push service says are gone (404 or 410), the way
 * devices.ts drops dead APNs tokens. Returns one result per browser.
 */
export async function pushToWebSubscriptions(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayloadArgs,
): Promise<WebSendResult[]> {
  if (!isWebPushConfigured()) return [];
  const { data, error } = await admin
    .from("web_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  // Before migration 0016 there is no table: no browsers to send to.
  if (error) return [];

  const body = buildWebPayload(payload);
  const options = {
    vapidDetails: { subject: env.vapidSubject(), publicKey: env.vapidPublicKey()!, privateKey: env.vapidPrivateKey()! },
    TTL: 60 * 60 * 12,
  };
  const results: WebSendResult[] = [];
  const gone: string[] = [];
  for (const sub of (data ?? []) as { endpoint: string; p256dh: string; auth: string }[]) {
    const endpointHost = new URL(sub.endpoint).host;
    try {
      const res = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        options,
      );
      results.push({ endpointHost, ok: true, status: res.statusCode });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 0;
      if (status === 404 || status === 410) gone.push(sub.endpoint);
      else console.error("web push send failed", endpointHost, status);
      results.push({ endpointHost, ok: false, status });
    }
  }
  if (gone.length > 0) await admin.from("web_push_subscriptions").delete().in("endpoint", gone);
  return results;
}
