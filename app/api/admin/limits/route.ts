import { json, requireAdminApi, safely } from "@/lib/admin/api";
import { limitsState, parseLimit, saveLimits } from "@/lib/admin/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/limits — the daily limits everyone gets, and everyone's spend
 * today. PUT { readingsPerDay, usdPerUserDay, usdAllUsersDay } replaces them;
 * null is "no limit". 400 {error:'invalid', field} for a bad value, 409
 * {error:'unavailable'} before migration 0018. See lib/usage/limits.ts.
 */
export async function GET(request: Request) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  return safely("limits", async () => json(await limitsState(ctx.db)));
}

export async function PUT(request: Request) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  return safely("limits put", async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const readingsPerDay = parseLimit(body.readingsPerDay, "readings");
    const usdPerUserDay = parseLimit(body.usdPerUserDay, "usd");
    const usdAllUsersDay = parseLimit(body.usdAllUsersDay, "usd");
    if (readingsPerDay === undefined) return json({ error: "invalid", field: "readingsPerDay" }, 400);
    if (usdPerUserDay === undefined) return json({ error: "invalid", field: "usdPerUserDay" }, 400);
    if (usdAllUsersDay === undefined) return json({ error: "invalid", field: "usdAllUsersDay" }, 400);
    if (!(await limitsState(ctx.db)).available) return json({ error: "unavailable" }, 409);
    await saveLimits(ctx.db, { readingsPerDay, usdPerUserDay, usdAllUsersDay }, ctx.user.id);
    return json(await limitsState(ctx.db));
  });
}
