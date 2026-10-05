import { createRouteSupabase } from "@/lib/supabase/route";
import { isMissingTable, loadFacts, logFactsError } from "@/lib/facts/store";
import { isMissingRelation, loadMemories, loadPredictions, logMemoryError } from "@/lib/memory/store";

export const runtime = "nodejs";

/**
 * Everything "What Astrya knows" shows: the standing facts, the summaries of
 * past conversations, and the predictions ledger. Read through the caller's
 * own session, so RLS scopes it. Each `available` flag is false while its
 * table has not been created in this database; clients show it empty.
 */
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [facts, memories, predictions] = await Promise.all([
    loadFacts(supabase, 100),
    loadMemories(supabase, 50),
    loadPredictions(supabase, 100),
  ]);
  return Response.json(
    {
      facts: facts.facts,
      summaries: memories.memories,
      predictions: predictions.predictions,
      available: { facts: facts.available, summaries: memories.available, predictions: predictions.available },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Forget everything: every fact, summary and prediction the caller has. Transcripts stay. */
export async function DELETE(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [facts, memories, predictions] = await Promise.all([
    supabase.from("user_facts").delete().eq("user_id", user.id),
    supabase.from("conversation_memories").delete().eq("user_id", user.id),
    supabase.from("predictions").delete().eq("user_id", user.id),
  ]);
  // No table means nothing was ever stored there: already forgotten.
  let failed = false;
  if (facts.error && !isMissingTable(facts.error)) {
    logFactsError("delete all", facts.error);
    failed = true;
  }
  if (memories.error && !isMissingRelation(memories.error)) {
    logMemoryError("conversation_memories", "delete all", memories.error);
    failed = true;
  }
  if (predictions.error && !isMissingRelation(predictions.error)) {
    logMemoryError("predictions", "delete all", predictions.error);
    failed = true;
  }
  if (failed) return Response.json({ error: "Could not forget everything. Please try again." }, { status: 500 });
  return Response.json({ ok: true });
}
