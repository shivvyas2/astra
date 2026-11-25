import { requireAdmin } from "@/lib/admin/guard";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { loadPeople } from "@/lib/admin/pulse";
import { adminUsers } from "@/lib/admin/stats";
import { STAGES, type Stage } from "@/lib/admin/types";
import { PAGE, UsersView } from "@/components/admin/views/UsersView";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; stage?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 120);
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const stage = (STAGES as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as Stage) : undefined;
  const db = createAdminSupabase();
  const people = await loadPeople(db);
  const { users, total } = await adminUsers(db, { q, stage, stages: people.stage, seen: people.lastSeen, limit: PAGE, offset: (page - 1) * PAGE });
  return <UsersView users={users} total={total} q={q} page={page} stage={stage} />;
}
