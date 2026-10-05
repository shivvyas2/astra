import { createRouteSupabase } from "@/lib/supabase/route";
import { loadBirthRow } from "@/lib/timeline/load";
import { extractLifeEvents, type Utterance } from "@/lib/timeline/extract";

export const runtime = "nodejs";
// Reading a chat history and extracting from it takes longer than a chat turn.
export const maxDuration = 120;

// Enough history to cover the "here is my situation" messages people open with,
// without loading a power user's entire transcript into memory.
const MAX_MESSAGES = 400;

/**
 * Proposes life events from what the user has already told us.
 *
 * Nothing is written to `life_events` here — the candidates come back for the
 * user to confirm. That matters: this is inferred content about someone's own
 * life, and silently filing an AI's guess about a death or a divorce onto
 * their timeline would be a bad thing to be wrong about.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const row = await loadBirthRow(supabase);
  if (!row) return Response.json({ error: "Complete your birth details first." }, { status: 400 });

  // Only the user's own words. Assistant turns are full of astrological
  // narrative that reads like biography and would extract as fiction.
  const { data: conversations } = await supabase.from("conversations").select("id");
  const ids = (conversations ?? []).map((c) => c.id as string);
  if (ids.length === 0) {
    await recordScan(supabase, user.id, 0);
    return Response.json({ candidates: [] });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("content, created_at")
    .in("conversation_id", ids)
    .eq("role", "user")
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);

  const utterances: Utterance[] = (messages ?? []).map((m) => ({
    content: String(m.content),
    createdAt: String(m.created_at),
  }));

  const candidates = await extractLifeEvents({
    birthDate: String(row.birth_date),
    today: new Date().toISOString().slice(0, 10),
    utterances,
    userId: user.id,
  });

  // Existing events suppress duplicates, so a re-scan after more chatting
  // proposes only what is genuinely new.
  const { data: existing } = await supabase.from("life_events").select("occurred_on, title");
  const seen = new Set(
    (existing ?? []).map((e) => `${e.occurred_on}:${String(e.title).toLowerCase()}`),
  );
  const titles = new Set((existing ?? []).map((e) => String(e.title).toLowerCase()));
  // An undated candidate has no date to match on, so a pinned moment with the
  // same name is taken to be the same moment.
  const fresh = candidates.filter((c) =>
    c.occurredOn === null
      ? !titles.has(c.title.toLowerCase())
      : !seen.has(`${c.occurredOn}:${c.title.toLowerCase()}`),
  );

  await recordScan(supabase, user.id, fresh.length);
  return Response.json({ candidates: fresh });
}

async function recordScan(
  supabase: Awaited<ReturnType<typeof createRouteSupabase>>,
  userId: string,
  found: number,
) {
  const { error } = await supabase.from("life_event_scans").upsert(
    { user_id: userId, scanned_at: new Date().toISOString(), found_count: found },
    { onConflict: "user_id" },
  );
  if (error) console.error("life event scan record error", error);
}
