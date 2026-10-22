import { redirect } from "next/navigation";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { listConversations, getMessages } from "@/lib/data/chat";
import { Chat } from "@/components/Chat";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerson } from "@/lib/profiles/store";
import type { ChatMode } from "@/lib/astrology/types";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; with?: string; ask?: string }>;
}) {
  const profile = await getBirthProfile();
  if (!profile?.chart) redirect("/app/intake");

  const { c, with: withId, ask } = await searchParams;
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
        initialTradition={((active as { tradition?: ChatMode } | undefined)?.tradition) ?? "vedic"}
      />
    );
  }

  // A match reading, opened from a compatibility page: both charts, and the
  // suggested question asked straight away.
  if (withId) {
    const { person } = await getPerson(await createServerSupabase(), withId);
    if (person?.chart) {
      return (
        <Chat
          key={`with-${person.id}`}
          firstName={profile.first_name}
          matchWith={{ id: person.id, name: person.label || person.first_name }}
          initialQuestion={ask?.slice(0, 500)}
        />
      );
    }
  }

  // New chat. Auto-generate a "today" reading only on the user's very first visit.
  return <Chat key="new" firstName={profile.first_name} autostart={conversations.length === 0} />;
}
