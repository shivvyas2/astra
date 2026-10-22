import { createServerSupabase } from "@/lib/supabase/server";
import type { ChatMode } from "@/lib/astrology/types";
import type { Db } from "@/lib/supabase/route";

export async function getOrCreateConversation(
  args: {
    userId: string;
    conversationId?: string;
    tradition: ChatMode;
    title: string;
    /** The saved person a match reading is about. Ignored for an existing conversation. */
    personId?: string | null;
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
  const row: { user_id: string; tradition: ChatMode; title: string; person_id?: string } = {
    user_id: args.userId,
    tradition: args.tradition,
    title: args.title.slice(0, 80),
  };
  let { data, error } = await supabase
    .from("conversations")
    .insert(args.personId ? { ...row, person_id: args.personId } : row)
    .select("id")
    .single();
  // Before migration 0015 there is no person_id: start an ordinary reading.
  if (error && args.personId && isMissingPersonColumn(error)) {
    ({ data, error } = await supabase.from("conversations").insert({ user_id: row.user_id, tradition: row.tradition, title: row.title }).select("id").single());
  }
  if (error || !data) throw new Error(error?.message ?? "Conversation not created");
  return data.id as string;
}

/** The saved person a conversation is about, or null for an ordinary reading. */
export async function getConversationPerson(conversationId: string, db?: Db): Promise<string | null> {
  const supabase = db ?? (await createServerSupabase());
  const { data, error } = await supabase
    .from("conversations")
    .select("person_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    if (!isMissingPersonColumn(error)) console.error("conversation person read error", error);
    return null;
  }
  return ((data as { person_id?: string | null } | null)?.person_id) ?? null;
}

/** Postgres's undefined column, or PostgREST's schema-cache miss: 0015 not applied. */
function isMissingPersonColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /person_id/.test(error.message ?? "");
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
