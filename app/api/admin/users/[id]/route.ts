import { json, requireAdminApi, safely } from "@/lib/admin/api";
import { adminUserDetail } from "@/lib/admin/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/users/:id — profile, stats, timeline, conversations, memory and usage. 404 when unknown. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  return safely("user", async () => {
    const detail = await adminUserDetail(ctx.db, id);
    return detail ? json(detail) : json({ error: "not_found" }, 404);
  });
}
