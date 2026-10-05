import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adminConversation } from "@/lib/admin/stats";
import { TranscriptView } from "@/components/admin/views/TranscriptView";

export default async function AdminTranscript({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const data = await adminConversation(createAdminSupabase(), id);
  if (!data) notFound();
  return <TranscriptView data={data} />;
}
