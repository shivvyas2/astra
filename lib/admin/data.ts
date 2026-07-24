import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
  firstName: string;
  lastName: string;
  place: string;
  birthDate: string;
  conversationCount: number;
};

export async function adminListUsers(): Promise<AdminUserRow[]> {
  const db = createAdminSupabase();
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = list?.users ?? [];

  const { data: profiles } = await db
    .from("birth_profiles")
    .select("user_id, first_name, last_name, place_name, birth_date");
  const { data: convs } = await db.from("conversations").select("id, user_id");

  const bp = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  const counts = new Map<string, number>();
  for (const c of convs ?? [])
    counts.set(c.user_id as string, (counts.get(c.user_id as string) ?? 0) + 1);

  return users
    .map((u) => {
      const p = bp.get(u.id) as
        | { first_name?: string; last_name?: string; place_name?: string; birth_date?: string }
        | undefined;
      return {
        id: u.id,
        email: u.email ?? "",
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
        firstName: p?.first_name ?? "",
        lastName: p?.last_name ?? "",
        place: p?.place_name ?? "",
        birthDate: p?.birth_date ?? "",
        conversationCount: counts.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function adminGetUser(id: string) {
  const db = createAdminSupabase();
  const { data } = await db.auth.admin.getUserById(id);
  const { data: birth } = await db.from("birth_profiles").select("*").eq("user_id", id).maybeSingle();
  const { data: conversations } = await db
    .from("conversations")
    .select("id, tradition, title, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false });
  return {
    user: data?.user
      ? {
          id: data.user.id,
          email: data.user.email ?? "",
          createdAt: data.user.created_at,
          lastSignIn: data.user.last_sign_in_at ?? null,
          confirmed: !!data.user.email_confirmed_at,
        }
      : null,
    birth: birth as Record<string, unknown> | null,
    conversations: conversations ?? [],
  };
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
