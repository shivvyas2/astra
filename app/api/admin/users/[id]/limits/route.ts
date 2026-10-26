import { json, requireAdminApi, safely } from "@/lib/admin/api";
import { parseLimit, saveUserLimits, userLimitsState } from "@/lib/admin/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/:id/limits — the defaults and this user's overrides.
 * PUT { readingsPerDay, usdPerUserDay } sets the overrides; null for a field
 * uses the default, and both null removes the override. 400
 * {error:'invalid', field} for a bad value, 409 {error:'unavailable'} before
 * migration 0018.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  return safely("user limits", async () => json(await userLimitsState(ctx.db, id)));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  return safely("user limits put", async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const readingsPerDay = parseLimit(body.readingsPerDay, "readings");
    const usdPerUserDay = parseLimit(body.usdPerUserDay, "usd");
    if (readingsPerDay === undefined) return json({ error: "invalid", field: "readingsPerDay" }, 400);
    if (usdPerUserDay === undefined) return json({ error: "invalid", field: "usdPerUserDay" }, 400);
    if (!(await userLimitsState(ctx.db, id)).available) return json({ error: "unavailable" }, 409);
    await saveUserLimits(ctx.db, id, { readingsPerDay, usdPerUserDay }, ctx.user.id);
    return json(await userLimitsState(ctx.db, id));
  });
}
