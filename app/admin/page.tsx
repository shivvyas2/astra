import { requireAdmin } from "@/lib/admin/guard";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adminOverview } from "@/lib/admin/stats";
import { limitsState } from "@/lib/admin/limits";
import { OverviewView, RANGES } from "@/components/admin/views/OverviewView";

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string; limits?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const db = createAdminSupabase();
  const [o, limits] = await Promise.all([adminOverview(db, days), limitsState(db)]);
  return <OverviewView o={o} limits={limits} limitsStatus={sp.limits} />;
}
