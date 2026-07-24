import { createServerSupabase } from "@/lib/supabase/server";
import type { Tradition } from "@/lib/astrology/types";

export async function getOrCreateConversation(args: {
  userId: string;
  conversationId?: string;
  tradition: Tradition;
  title: string;
}): Promise<string> {
  const supabase = await createServerSupabase();
  if (args.conversationId) return args.conversationId;
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: args.userId, tradition: args.tradition, title: args.title.slice(0, 80) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function appendMessage(conversationId: string, role: "user" | "assistant", content: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, role, content });
  if (error) throw new Error(error.message);
}

export async function getMessages(conversationId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listConversations() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("conversations")
    .select("id, tradition, title, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}
