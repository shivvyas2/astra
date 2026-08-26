import { env } from "@/lib/env";
import { runDailyAlerts } from "@/lib/alerts/run";

// swisseph-wasm recomputes today's sky per user, and the model writes the copy.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The daily dosha sweep, fired by the Vercel cron in `vercel.json`.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
 * With no secret configured the route refuses everything rather than exposing
 * a job that spends model tokens to anyone who finds the path.
 */
export async function GET(request: Request) {
  const secret = env.cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runDailyAlerts();
    return Response.json(summary);
  } catch (err) {
    console.error("alerts cron failed", err);
    return Response.json({ error: "Alert run failed" }, { status: 500 });
  }
}
