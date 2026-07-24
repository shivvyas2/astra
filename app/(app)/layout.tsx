import { listConversations } from "@/lib/data/chat";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const conversations = await listConversations();
  return <AppShell conversations={conversations as never}>{children}</AppShell>;
}
