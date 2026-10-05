import { env } from "@/lib/env";
import { runDailyAlerts } from "@/lib/alerts/run";
import { runDuePredictions } from "@/lib/alerts/predictions";
import { runDiscoveries } from "@/lib/alerts/discoveries";

// swisseph-wasm recomputes today's sky, and the model writes each reading.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The scheduled job: every hour from `.github/workflows/cron.yml`, plus the
 * two daily crons in `vercel.json` as a backstop.
 *
 * All three parts are decided per user rather than per run, on the user's
 * own clock: the morning and night readings have delivery windows, the dosha
 * sweep only notifies when something changed and only in waking hours, and
 * a discovery lands on a hashed day and hour. Extra runs find nothing to do.
 */
export async function GET(request: Request) {
  const secret = env.cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const predictions = await runDuePredictions();
    const alerts = await runDailyAlerts();
    const discoveries = await runDiscoveries();
    return Response.json({ predictions, alerts, discoveries });
  } catch (err) {
    console.error("daily cron failed", err);
    return Response.json({ error: "Daily run failed" }, { status: 500 });
  }
}
