import { json, requireAdminApi, safely } from "@/lib/admin/api";
import { sendTestPush } from "@/lib/push/test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/push-test — sends a test notification to the calling
 * admin's own phones, now, and returns what Apple answered for each.
 * See lib/push/test.ts.
 */
export async function POST(request: Request) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  return safely("push-test", async () => json(await sendTestPush(ctx.db, ctx.user.id)));
}
