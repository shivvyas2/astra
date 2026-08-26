import "server-only";
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { computeChart } from "@/lib/astrology/chart";
import { detectConditions, highestSeverity, type Condition, type Severity } from "@/lib/astrology/doshas";
import type { Chart } from "@/lib/astrology/types";
import { composeAlert } from "./compose";
import { ApnsClient, isPushConfigured, type PushEnvironment } from "@/lib/push/apns";

/** Only these reach a lock screen; `info` conditions are recorded silently. */
const NOTIFIABLE: Severity[] = ["caution", "warning"];
/** A single alert stays readable; more than this and it becomes a list. */
const MAX_CONDITIONS_PER_ALERT = 6;

type ProfileRow = {
  user_id: string;
  first_name: string;
  lat: number;
  lng: number;
  timezone: string | null;
  chart: { vedic: Chart; western: Chart } | null;
};

type OpenCondition = {
  id: string;
  kind: string;
  signature: string;
  label: string;
  severity: Severity;
  scope: "natal" | "transit";
  detail: string;
};

export type UserAlertResult = {
  userId: string;
  started: string[];
  ended: string[];
  alerted: boolean;
  pushesSent: number;
};

export type DailyAlertSummary = {
  processed: number;
  alerted: number;
  pushesSent: number;
  failures: number;
  pushConfigured: boolean;
};

/**
 * The daily job.
 *
 * For every user with a chart: recompute today's sky, diff the afflictions it
 * forms against the ones already on record, and — when something crossed in or
 * out — write one alert and push it. Conditions that merely continue are not
 * re-notified, which is what keeps a standing Sade Sati from becoming a daily
 * nag.
 */
export async function runDailyAlerts(options: { limit?: number } = {}): Promise<DailyAlertSummary> {
  const admin = createAdminSupabase();
  const apns = new ApnsClient();
  const summary: DailyAlertSummary = {
    processed: 0,
    alerted: 0,
    pushesSent: 0,
    failures: 0,
    pushConfigured: isPushConfigured(),
  };

  try {
    const { data, error } = await admin
      .from("birth_profiles")
      .select("user_id, first_name, lat, lng, timezone, chart")
      .not("chart", "is", null)
      .limit(options.limit ?? 500);
    if (error) throw new Error(error.message);

    for (const profile of (data ?? []) as ProfileRow[]) {
      try {
        const result = await runAlertsForUser(profile, admin, apns);
        summary.processed += 1;
        if (result?.alerted) summary.alerted += 1;
        summary.pushesSent += result?.pushesSent ?? 0;
      } catch (err) {
        summary.failures += 1;
        console.error("alerts: user failed", profile.user_id, err);
      }
    }
  } finally {
    apns.close();
  }

  return summary;
}

export async function runAlertsForUser(
  profile: ProfileRow,
  admin: SupabaseClient,
  apns: ApnsClient,
): Promise<UserAlertResult | null> {
  const natal = profile.chart?.vedic;
  if (!natal) return null;

  const zone = profile.timezone || "UTC";
  const nowLocal = DateTime.now().setZone(zone);
  const nowUtc = DateTime.utc();

  // Today's sky at the user's birthplace, the same way the chat route does it.
  const transit = await computeChart(
    {
      birthDate: nowUtc.toFormat("yyyy-LL-dd"),
      birthTime: nowUtc.toFormat("HH:mm"),
      lat: Number(profile.lat),
      lng: Number(profile.lng),
      timezone: "UTC",
    },
    "vedic",
  );

  const current = detectConditions(natal, transit);
  const currentBySignature = new Map(current.map((c) => [c.signature, c]));

  const { data: openRows, error: openError } = await admin
    .from("transit_conditions")
    .select("id, kind, signature, label, severity, scope, detail")
    .eq("user_id", profile.user_id)
    .is("ended_on", null);
  if (openError) throw new Error(openError.message);

  const open = (openRows ?? []) as OpenCondition[];
  const openSignatures = new Set(open.map((row) => row.signature));

  const started = current.filter((c) => !openSignatures.has(c.signature));
  const ended = open.filter((row) => !currentBySignature.has(row.signature));

  const today = nowLocal.toFormat("yyyy-LL-dd");

  if (started.length > 0) {
    const { error } = await admin.from("transit_conditions").insert(
      started.map((c) => ({
        user_id: profile.user_id,
        kind: c.kind,
        signature: c.signature,
        label: c.label,
        severity: c.severity,
        scope: c.scope,
        detail: c.detail,
        started_on: today,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (ended.length > 0) {
    const { error } = await admin
      .from("transit_conditions")
      .update({ ended_on: today })
      .in("id", ended.map((row) => row.id));
    if (error) throw new Error(error.message);
  }

  const startedWorth = started.filter((c) => NOTIFIABLE.includes(c.severity)).slice(0, MAX_CONDITIONS_PER_ALERT);
  const endedWorth: Condition[] = ended
    .filter((row) => NOTIFIABLE.includes(row.severity))
    .slice(0, MAX_CONDITIONS_PER_ALERT)
    .map((row) => ({
      kind: row.kind,
      signature: row.signature,
      label: row.label,
      severity: row.severity,
      scope: row.scope,
      detail: row.detail,
    }));

  const result: UserAlertResult = {
    userId: profile.user_id,
    started: started.map((c) => c.signature),
    ended: ended.map((row) => row.signature),
    alerted: false,
    pushesSent: 0,
  };

  if (startedWorth.length === 0 && endedWorth.length === 0) return result;

  const severity = highestSeverity(startedWorth.length > 0 ? startedWorth : endedWorth);
  const copy = await composeAlert({
    firstName: profile.first_name,
    chart: natal,
    today: nowLocal.toFormat("cccc, LLLL d, yyyy"),
    started: startedWorth,
    ended: endedWorth,
    severity,
  });

  const { data: alertRow, error: alertError } = await admin
    .from("alerts")
    .insert({
      user_id: profile.user_id,
      severity,
      kinds: [...startedWorth, ...endedWorth].map((c) => c.kind),
      title: copy.title,
      body: copy.body,
      detail: copy.detail,
    })
    .select("id")
    .single();
  if (alertError) throw new Error(alertError.message);

  result.alerted = true;
  result.pushesSent = await pushToDevices(admin, apns, profile.user_id, alertRow.id as string, copy.title, copy.body);
  return result;
}

async function pushToDevices(
  admin: SupabaseClient,
  apns: ApnsClient,
  userId: string,
  alertId: string,
  title: string,
  body: string,
): Promise<number> {
  if (!isPushConfigured()) return 0;

  const { data } = await admin
    .from("device_tokens")
    .select("token, environment")
    .eq("user_id", userId);

  let sent = 0;
  const dead: string[] = [];
  for (const device of (data ?? []) as { token: string; environment: PushEnvironment }[]) {
    const result = await apns.send({
      deviceToken: device.token,
      environment: device.environment,
      title,
      body,
      alertId,
    });
    if (result.ok) sent += 1;
    else if (result.unregistered) dead.push(device.token);
    else console.error("apns send failed", result.status, result.reason);
  }

  // Apple only tells you a token is dead when you use it; drop it now so the
  // table does not fill with tokens from deleted apps.
  if (dead.length > 0) await admin.from("device_tokens").delete().in("token", dead);

  return sent;
}
