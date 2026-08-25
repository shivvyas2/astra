import { createServerSupabase } from "@/lib/supabase/server";
import type { ChatMode } from "@/lib/astrology/types";
import type { Db } from "@/lib/supabase/route";

export async function getOrCreateConversation(
  args: {
    userId: string;
    conversationId?: string;
    tradition: ChatMode;
    title: string;
  },
  db?: Db,
): Promise<string> {
  const supabase = db ?? (await createServerSupabase());
  if (args.conversationId) {
    // Defense-in-depth on top of RLS: verify the conversation actually
    // belongs to this user before reusing it.
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", args.conversationId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (!existing) throw new Error("Conversation not found");
    return existing.id as string;
  }
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: args.userId, tradition: args.tradition, title: args.title.slice(0, 80) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  db?: Db,
) {
  const supabase = db ?? (await createServerSupabase());
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, role, content });
  if (error) throw new Error(error.message);
}

export async function getMessages(conversationId: string, db?: Db) {
  const supabase = db ?? (await createServerSupabase());
  const { data } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listConversations(db?: Db) {
  const supabase = db ?? (await createServerSupabase());
  const { data } = await supabase
    .from("conversations")
    .select("id, tradition, title, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}
