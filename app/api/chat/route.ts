import type Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { createRouteSupabase } from "@/lib/supabase/route";
import { anthropic, READING_MODEL, DEEP_READING_MODEL, supportsAdaptiveThinking } from "@/lib/anthropic";
import { buildSystemPrompt, buildNumerologyPrompt } from "@/lib/astrology/prompt";
import { computeNumerology, computeNameNumber } from "@/lib/astrology/numerology";
import { computeChart } from "@/lib/astrology/chart";
import type { Chart, Tradition, ChatMode } from "@/lib/astrology/types";
import { getOrCreateConversation, appendMessage, getMessages } from "@/lib/data/chat";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json()) as {
    conversationId?: string;
    tradition: ChatMode;
    message: string;
    deep?: boolean;
  };
  if (!body.message?.trim()) return new Response("Empty message", { status: 400 });
  if (!["vedic", "western", "numerology"].includes(body.tradition)) {
    return new Response("Invalid mode", { status: 400 });
  }

  let conversationId: string;
  let messages: { role: "user" | "assistant"; content: string }[];
  let system: string;

  try {
    const { data: profile } = await supabase
      .from("birth_profiles")
      .select("first_name, last_name, birth_date, lat, lng, timezone, chart")
      .maybeSingle();
    if (!profile?.chart) return new Response("No chart. Complete intake first.", { status: 400 });

    // "Today"/"now" framed in the USER's timezone (e.g. IST), not the server's.
    const userTz = String(profile.timezone || "UTC");
    const nowLocal = DateTime.now().setZone(userTz);
    const today = `${nowLocal.toFormat("cccc, LLLL d, yyyy")} — their local time is ${nowLocal.toFormat("h:mm a")} (${userTz})`;
    const num = computeNumerology(String(profile.birth_date));

    if (body.tradition === "numerology") {
      const fullName = `${profile.first_name} ${profile.last_name}`.trim();
      system = buildNumerologyPrompt({
        firstName: profile.first_name,
        fullName,
        mulank: num.mulank,
        bhagyank: num.bhagyank,
        namank: computeNameNumber(fullName),
        today,
      });
    } else {
      const chart = (profile.chart as { vedic: Chart; western: Chart })[body.tradition as Tradition];

      // Live transits: compute the current sky at the user's location right now.
      let transits: string | undefined;
      try {
        const nowUtc = new Date();
        const transitChart = await computeChart(
          {
            birthDate: nowUtc.toISOString().slice(0, 10),
            birthTime: nowUtc.toISOString().slice(11, 16),
            lat: Number(profile.lat),
            lng: Number(profile.lng),
            timezone: "UTC",
          },
          body.tradition as Tradition,
        );
        transits = transitChart.planets
          .map((p) => `${p.name} in ${p.sign}${p.retrograde ? " (retrograde)" : ""}`)
          .join(", ");
      } catch {
        transits = undefined;
      }

      system = buildSystemPrompt({
        firstName: profile.first_name,
        tradition: body.tradition as Tradition,
        chart,
        today,
        numerology: num,
        transits,
      });
    }

    conversationId = await getOrCreateConversation(
      {
        userId: user.id,
        conversationId: body.conversationId,
        tradition: body.tradition,
        title: body.message,
      },
      supabase,
    );

    // Build history from persisted messages, then append the new user turn.
    // Cap history to the last 10 turns to bound input tokens (cost) on long chats.
    const history = await getMessages(conversationId, supabase);
    messages = history
      .slice(-10)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    messages.push({ role: "user", content: body.message });
    await appendMessage(conversationId, "user", body.message, supabase);
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
        if (full.trim()) await appendMessage(conversationId, "assistant", full, supabase);
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
