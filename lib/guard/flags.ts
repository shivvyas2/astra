import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isMissingRelation } from "@/lib/usage/record";
import type { FlagKind } from "./scope";

/** Notes that a message was turned away: which kind, never what it said. Never throws. */
export async function recordFlag(args: { userId: string; conversationId: string; kind: FlagKind }): Promise<void> {
  try {
    const { error } = await createAdminSupabase()
      .from("chat_flags")
      .insert({ user_id: args.userId, conversation_id: args.conversationId, kind: args.kind });
    if (error && !isMissingRelation(error)) console.error("chat flag not recorded", error);
  } catch (err) {
    console.error("chat flag not recorded", err);
  }
}
