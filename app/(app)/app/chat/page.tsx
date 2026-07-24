import { redirect } from "next/navigation";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { listConversations, getMessages } from "@/lib/data/chat";
import { Chat } from "@/components/Chat";
import type { Tradition } from "@/lib/astrology/types";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const profile = await getBirthProfile();
  if (!profile?.chart) redirect("/app/intake");

  const { c } = await searchParams;
  const conversations = await listConversations();

  if (c) {
    const active = conversations.find((cv: { id: string }) => cv.id === c);
    const msgs = await getMessages(c);
    const initialMessages = msgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    return (
      <Chat
        key={c}
        firstName={profile.first_name}
        initialConversationId={c}
        initialMessages={initialMessages}
        initialTradition={((active as { tradition?: Tradition } | undefined)?.tradition) ?? "vedic"}
      />
    );
  }

  // New chat. Auto-generate a "today" reading only on the user's very first visit.
  return <Chat key="new" firstName={profile.first_name} autostart={conversations.length === 0} />;
}
