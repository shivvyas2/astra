import type Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase/server";
import { anthropic, READING_MODEL, DEEP_READING_MODEL, supportsAdaptiveThinking } from "@/lib/anthropic";
import { buildSystemPrompt } from "@/lib/astrology/prompt";
import { computeNumerology } from "@/lib/astrology/numerology";
import type { Chart, Tradition } from "@/lib/astrology/types";
import { getOrCreateConversation, appendMessage, getMessages } from "@/lib/data/chat";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json()) as {
    conversationId?: string;
    tradition: Tradition;
    message: string;
    deep?: boolean;
  };
  if (!body.message?.trim()) return new Response("Empty message", { status: 400 });
  if (body.tradition !== "vedic" && body.tradition !== "western") {
    return new Response("Invalid tradition", { status: 400 });
  }

  let conversationId: string;
  let messages: { role: "user" | "assistant"; content: string }[];
  let system: string;

  try {
    const { data: profile } = await supabase
      .from("birth_profiles")
      .select("first_name, birth_date, chart")
      .maybeSingle();
    if (!profile?.chart) return new Response("No chart. Complete intake first.", { status: 400 });

    const chart = (profile.chart as { vedic: Chart; western: Chart })[body.tradition];
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const numerology = computeNumerology(String(profile.birth_date));
    system = buildSystemPrompt({ firstName: profile.first_name, tradition: body.tradition, chart, today, numerology });

    conversationId = await getOrCreateConversation({
      userId: user.id,
      conversationId: body.conversationId,
      tradition: body.tradition,
      title: body.message,
    });

    // Build history from persisted messages, then append the new user turn.
    // Cap history to the last 10 turns to bound input tokens (cost) on long chats.
    const history = await getMessages(conversationId);
    messages = history
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    messages.push({ role: "user", content: body.message });
    await appendMessage(conversationId, "user", body.message);
  } catch (err) {
    console.error("chat pre-stream error", err);
    return new Response("Something went wrong preparing your reading. Please try again.", { status: 500 });
  }

  const model = body.deep ? DEEP_READING_MODEL : READING_MODEL;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        const s = anthropic().messages.stream({
          model,
          // Room for adaptive thinking + a concise reading (deep gets more).
          max_tokens: body.deep ? 4096 : 2048,
          // Only the deep (Opus) model supports adaptive thinking; Haiku rejects it.
          // The installed SDK's types predate "adaptive", so cast through unknown to
          // keep the runtime value exact while satisfying the older union at compile time.
          ...(supportsAdaptiveThinking(model)
            ? { thinking: { type: "adaptive" } as unknown as Anthropic.ThinkingConfigParam }
            : {}),
          system,
          messages,
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        console.error("chat stream error", err);
        controller.enqueue(encoder.encode("\n\n[The stars are momentarily clouded. Please try again.]"));
      } finally {
        if (full.trim()) await appendMessage(conversationId, "assistant", full);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-conversation-id": conversationId,
      "cache-control": "no-store",
    },
  });
}
