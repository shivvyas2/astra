import { requireAdmin } from "@/lib/admin/guard";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adminUsers } from "@/lib/admin/stats";
import { PAGE, UsersView } from "@/components/admin/views/UsersView";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 120);
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const { users, total } = await adminUsers(createAdminSupabase(), { q, limit: PAGE, offset: (page - 1) * PAGE });
  return <UsersView users={users} total={total} q={q} page={page} />;
}
