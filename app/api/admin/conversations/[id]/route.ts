import { json, requireAdminApi, safely } from "@/lib/admin/api";
import { adminConversation } from "@/lib/admin/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/conversations/:id — the transcript, oldest first. 404 when unknown. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminApi(request);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  return safely("conversation", async () => {
    const conv = await adminConversation(ctx.db, id);
    return conv ? json(conv) : json({ error: "not_found" }, 404);
  });
}
