import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adminUserDetail } from "@/lib/admin/stats";
import { UserView } from "@/components/admin/views/UserView";

export default async function AdminUser({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; reset?: string; login_link?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const d = await adminUserDetail(createAdminSupabase(), id);
  if (!d) notFound();
  return <UserView d={d} sp={await searchParams} />;
}
