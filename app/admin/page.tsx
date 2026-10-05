import { requireAdmin } from "@/lib/admin/guard";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adminOverview } from "@/lib/admin/stats";
import { OverviewView, RANGES } from "@/components/admin/views/OverviewView";

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  return <OverviewView o={await adminOverview(createAdminSupabase(), days)} />;
}
