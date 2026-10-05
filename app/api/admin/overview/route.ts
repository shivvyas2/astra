import { json, requireAdminApi, safely } from "@/lib/admin/api";
import { adminOverview } from "@/lib/admin/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/overview?days=30 — totals, daily series and breakdowns. See lib/admin/types.ts. */
export async function GET(request: Request) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
  return safely("overview", async () => json(await adminOverview(ctx.db, Number.isFinite(days) ? days : 30)));
}
