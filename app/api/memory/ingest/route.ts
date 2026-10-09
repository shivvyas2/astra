import { DateTime } from "luxon";
import { after } from "next/server";
import { createRouteSupabase } from "@/lib/supabase/route";
import { loadFacts } from "@/lib/facts/store";
import { MAX_FACTS, isUuid } from "@/lib/facts/types";
import { MAX_INGEST_BYTES, applyMemoryUpdate, checkIngestShape, parseMemoryUpdate } from "@/lib/memory/apply";
import { rememberTurn } from "@/lib/memory/extract";
import { loadMemories, loadPredictions } from "@/lib/memory/store";
import { requireConsent } from "@/lib/billing/consent";

export const runtime = "nodejs";

/**
 * What the iPhone's on-device model worked out after a reading — fact
 * changes, the conversation's new summary, the predictions the reading made —
 * written as the user. The chat request for that turn said
 * `memory: "on-device"`, so the server skipped its own Haiku pass; this is the
 * other half, and it costs no model call at all.
 *
 * Nothing from the device is trusted. The conversation must be the caller's,
 * fact ids must be the caller's own facts, and every item goes through the
 * same validation as the server pass (lib/memory/apply.ts): lengths,
 * categories, topics, dated windows, and no astrology stored as a fact about
 * their life. A malformed or oversized request is refused outright; a bad
 * item in a good request is dropped and counted in `rejected`.
 *
 * `{ conversationId, fallback: "server" }` is for when the on-device model
 * could not run after all (a refusal, the model unloaded): the server runs
 * its own pass on the conversation's last exchange instead, so the turn is
 * still remembered.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const text = await request.text();
  if (text.length > MAX_INGEST_BYTES) return Response.json({ error: "Too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const conversationId = body.conversationId;
  if (!isUuid(conversationId)) return Response.json({ error: "Missing conversationId" }, { status: 400 });
  const shapeError = checkIngestShape(body);
  if (shapeError) return Response.json({ error: shapeError }, { status: 400 });

  // RLS already hides other people's conversations; this makes "not yours"
  // a clear 404 rather than writes that silently fail.
  const { data: owned } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return Response.json({ error: "Conversation not found" }, { status: 404 });

  const today = DateTime.utc().toISODate()!;

  if (body.fallback === "server") {
    // The server pass sends the exchange to Anthropic: only with AI consent.
    const consentBlock = await requireConsent(supabase, user.id);
    if (consentBlock) return consentBlock;
    const turn = await lastExchange(supabase, conversationId);
    if (!turn) return Response.json({ ok: true, fallback: false });
    try {
      after(() => rememberTurn({ db: supabase, userId: user.id, conversationId, today, ...turn }));
    } catch (err) {
      console.error("memory fallback not scheduled", err);
    }
    return Response.json({ ok: true, fallback: true });
  }

  const [factsLoad, memoriesLoad, predictionsLoad] = await Promise.all([
    loadFacts(supabase, MAX_FACTS + 20),
    loadMemories(supabase, 1),
    loadPredictions(supabase, 100),
  ]);
  const available = {
    facts: factsLoad.available,
    memories: memoriesLoad.available,
    predictions: predictionsLoad.available,
  };
  const { update, rejected } = parseMemoryUpdate(body, {
    existingFactIds: new Set(factsLoad.facts.map((f) => f.id)),
    today,
  });
  const applied = await applyMemoryUpdate(supabase, {
    userId: user.id,
    conversationId,
    update,
    existingFacts: factsLoad.facts,
    existingPredictions: predictionsLoad.predictions,
    available,
    source: "on_device",
  });

  return Response.json({
    ok: true,
    available: { facts: available.facts, summaries: available.memories, predictions: available.predictions },
    applied: {
      added: applied.facts?.inserts.length ?? 0,
      updated: applied.facts?.updates.length ?? 0,
      removed: applied.facts?.deletes.length ?? 0,
      summary: applied.summary,
      predictions: applied.predictions.length,
    },
    rejected,
  });
}

/** The conversation's newest user message, the reply to it, and the reply before that. */
async function lastExchange(
  db: Awaited<ReturnType<typeof createRouteSupabase>>,
  conversationId: string,
): Promise<{ message: string; reply: string; previousReply: string | null } | null> {
  const { data } = await db
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(3);
  const rows = (data ?? []) as { role: string; content: string }[];
  if (rows[0]?.role !== "assistant" || rows[1]?.role !== "user") return null;
  return {
    reply: rows[0].content,
    message: rows[1].content,
    previousReply: rows[2]?.role === "assistant" ? rows[2].content : null,
  };
}
