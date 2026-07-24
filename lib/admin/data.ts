import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function adminListUsers() {
  const db = createAdminSupabase();
  const { data: profiles } = await db.from("profiles").select("id, display_name, created_at");
  const { data: convs } = await db.from("conversations").select("id, user_id");
  const counts = new Map<string, number>();
  for (const c of convs ?? []) counts.set(c.user_id, (counts.get(c.user_id) ?? 0) + 1);
  return (profiles ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name ?? "(unnamed)",
    createdAt: p.created_at,
    conversationCount: counts.get(p.id) ?? 0,
  }));
}

export async function adminListConversations(userId: string) {
  const db = createAdminSupabase();
  const { data } = await db
    .from("conversations")
    .select("id, tradition, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function adminGetTranscript(conversationId: string) {
  const db = createAdminSupabase();
  const { data: conv } = await db
    .from("conversations")
    .select("id, user_id, tradition, title, created_at")
    .eq("id", conversationId)
    .single();
  const { data: messages } = await db
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return { conv, messages: messages ?? [] };
}
