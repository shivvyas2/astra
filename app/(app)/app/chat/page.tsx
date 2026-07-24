import { redirect } from "next/navigation";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { Chat } from "@/components/Chat";

export default async function ChatPage() {
  const profile = await getBirthProfile();
  if (!profile?.chart) redirect("/app/intake");
  return <Chat />;
}
