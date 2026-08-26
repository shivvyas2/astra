import { env } from "@/lib/env";
import { runDailyAlerts } from "@/lib/alerts/run";
import { runDuePredictions } from "@/lib/alerts/predictions";

// swisseph-wasm recomputes today's sky, and the model writes each reading.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The scheduled job, fired twice a day by the crons in `vercel.json`.
 *
 * Both halves are decided per user rather than per run: predictions use the
 * user's local clock to pick the morning or night slot, and the dosha sweep
 * only notifies when something actually changed. That makes the endpoint safe
 * to run more often than twice — extra runs mostly find nothing to do.
 */
export async function GET(request: Request) {
  const secret = env.cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const predictions = await runDuePredictions();
    const alerts = await runDailyAlerts();
    return Response.json({ predictions, alerts });
  } catch (err) {
    console.error("daily cron failed", err);
    return Response.json({ error: "Daily run failed" }, { status: 500 });
  }
}
