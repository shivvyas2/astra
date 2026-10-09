import type { Db } from "@/lib/supabase/route";
import { isMissingRelation } from "@/lib/memory/store";
import type { Checkin } from "./patterns";

/** Days of check-ins a pattern is read over: about six months. */
export const MOOD_WINDOW = 180;

export async function loadCheckins(db: Db, limit = MOOD_WINDOW): Promise<{ checkins: Checkin[]; available: boolean }> {
  const { data, error } = await db.from("mood_checkins").select("day, mood").order("day", { ascending: false }).limit(limit);
  if (error) {
    if (!isMissingRelation(error)) console.error("mood read error", error);
    return { checkins: [], available: !isMissingRelation(error) };
  }
  return { checkins: (data ?? []) as Checkin[], available: true };
}

/** One check-in per day: a second tap the same day changes it. */
export async function saveCheckin(db: Db, userId: string, day: string, mood: number): Promise<"ok" | "missing" | "error"> {
  const { error } = await db
    .from("mood_checkins")
    .upsert({ user_id: userId, day, mood, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
  if (!error) return "ok";
  if (isMissingRelation(error)) return "missing";
  console.error("mood write error", error);
  return "error";
}
