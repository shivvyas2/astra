import { json, requireAdminApi, safely } from "@/lib/admin/api";
import { adminUsers } from "@/lib/admin/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/users?q=&limit=50&offset=0 — newest active first; q matches email or name. */
export async function GET(request: Request) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  const sp = new URL(request.url).searchParams;
  const num = (v: string | null, d: number) => (v !== null && Number.isFinite(Number(v)) ? Number(v) : d);
  return safely("users", async () =>
    json(await adminUsers(ctx.db, { q: sp.get("q") ?? "", limit: num(sp.get("limit"), 50), offset: num(sp.get("offset"), 0) })),
  );
}
