import { listConversations } from "@/lib/data/chat";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Birth details and the chart need no AI. The AI notice (App Store 5.1.2)
  // stands in front of Ask, and every AI route checks it again on the server.
  const conversations = await listConversations();
  return <AppShell conversations={conversations as never}>{children}</AppShell>;
}
