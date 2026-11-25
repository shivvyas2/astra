import { listConversations } from "@/lib/data/chat";
import { createServerSupabase } from "@/lib/supabase/server";
import { touchActivity } from "@/lib/data/activity";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Birth details and the chart need no AI. The AI notice (App Store 5.1.2)
  // stands in front of Ask, and every AI route checks it again on the server.
  const db = await createServerSupabase();
  const { data: { session } } = await db.auth.getSession();
  if (session) touchActivity(db, session.user.id);
  const conversations = await listConversations();
  return <AppShell conversations={conversations as never}>{children}</AppShell>;
}
