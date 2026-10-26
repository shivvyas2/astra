import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adminUserDetail } from "@/lib/admin/stats";
import { userLimitsState } from "@/lib/admin/limits";
import { UserView } from "@/components/admin/views/UserView";

export default async function AdminUser({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; reset?: string; login_link?: string; limits?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const db = createAdminSupabase();
  const [d, limits] = await Promise.all([adminUserDetail(db, id), userLimitsState(db, id)]);
  if (!d) notFound();
  return <UserView d={d} sp={await searchParams} limits={limits} />;
}
