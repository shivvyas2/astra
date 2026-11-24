import type { Db } from "@/lib/supabase/route";

/** Whether the caller has entered birth details. A failed read says yes: never lock someone out on a hiccup. */
export async function hasOwnProfile(db: Db): Promise<boolean> {
  try {
    const { data, error } = await db.from("birth_profiles").select("user_id").maybeSingle();
    return error ? true : data !== null;
  } catch {
    return true;
  }
}
