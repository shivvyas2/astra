import "server-only";
import http2 from "node:http2";
import { createPrivateKey, sign as signWithKey } from "node:crypto";
import { env } from "@/lib/env";

export type PushEnvironment = "sandbox" | "production";

export type PushResult = {
  ok: boolean;
  status: number;
  reason?: string;
  /** The token is dead — Apple says stop sending to it. Delete the row. */
  unregistered: boolean;
};

const HOSTS: Record<PushEnvironment, string> = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};

/** Whether APNs credentials are configured at all. */
export function isPushConfigured(): boolean {
  return Boolean(env.apnsKeyId() && env.apnsTeamId() && env.apnsBundleId() && env.apnsPrivateKey());
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

// Apple accepts a provider token for an hour and rate-limits regeneration, so
// one token is reused across sends and across warm invocations.
let cachedToken: { value: string; issuedAt: number } | null = null;

function providerToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < 45 * 60) return cachedToken.value;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: env.apnsKeyId() }));
  const payload = base64url(JSON.stringify({ iss: env.apnsTeamId(), iat: now }));
  const key = createPrivateKey(env.apnsPrivateKey()!);
  // ES256 wants the raw r‖s pair, not the DER encoding Node produces by default.
  const signature = signWithKey("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  const value = `${header}.${payload}.${base64url(signature)}`;
  cachedToken = { value, issuedAt: now };
  return value;
}

/**
 * Sends alert pushes over APNs' HTTP/2 API.
 *
 * One session per environment is kept open for the life of the client, so a
 * run that notifies many users pays for one TLS handshake, not one per device.
 */
export class ApnsClient {
  private sessions = new Map<PushEnvironment, http2.ClientHttp2Session>();

  private session(environment: PushEnvironment): http2.ClientHttp2Session {
    const existing = this.sessions.get(environment);
    if (existing && !existing.closed && !existing.destroyed) return existing;

    const session = http2.connect(HOSTS[environment]);
    // Without a handler a socket-level error would surface as an unhandled
    // 'error' event and take the process down.
    session.on("error", () => this.sessions.delete(environment));
    this.sessions.set(environment, session);
    return session;
  }

  async send(args: {
    deviceToken: string;
    environment: PushEnvironment;
    title: string;
    body: string;
    alertId: string;
    /** Which screen the app should open on a tap. */
    kind?: "alert" | "daily";
    /** Groups a user's notifications into one thread. */
    threadId?: string;
  }): Promise<PushResult> {
    if (!isPushConfigured()) {
      return { ok: false, status: 0, reason: "APNsNotConfigured", unregistered: false };
    }

    const payload = JSON.stringify({
      aps: {
        alert: { title: args.title, body: args.body },
        sound: "default",
        "thread-id": args.threadId ?? "sanchara-alerts",
        "interruption-level": "active",
      },
      alert_id: args.alertId,
      kind: args.kind ?? "alert",
    });

    return new Promise<PushResult>((resolve) => {
      let settled = false;
      const settle = (result: PushResult) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      let request: http2.ClientHttp2Stream;
      try {
        request = this.session(args.environment).request({
          ":method": "POST",
          ":path": `/3/device/${args.deviceToken}`,
          authorization: `bearer ${providerToken()}`,
          "apns-topic": env.apnsBundleId()!,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        });
      } catch (err) {
        return settle({
          ok: false,
          status: 0,
          reason: err instanceof Error ? err.message : "RequestFailed",
          unregistered: false,
        });
      }

      let status = 0;
      let raw = "";
      request.setEncoding("utf8");
      request.setTimeout(10_000, () => {
        request.close(http2.constants.NGHTTP2_CANCEL);
        settle({ ok: false, status: 0, reason: "Timeout", unregistered: false });
      });
      request.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("error", (err) => {
        settle({ ok: false, status: 0, reason: err.message, unregistered: false });
      });
      request.on("end", () => {
        let reason: string | undefined;
        if (raw) {
          try {
            reason = (JSON.parse(raw) as { reason?: string }).reason;
          } catch {
            reason = raw.slice(0, 120);
          }
        }
        settle({
          ok: status === 200,
          status,
          reason,
          unregistered:
            status === 410 || reason === "Unregistered" || reason === "BadDeviceToken",
        });
      });
      request.end(payload);
    });
  }

  close() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}
