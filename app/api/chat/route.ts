import type Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { createRouteSupabase } from "@/lib/supabase/route";
import { anthropic, READING_MODEL, DEEP_READING_MODEL, supportsAdaptiveThinking, LOW_EFFORT } from "@/lib/anthropic";
import { buildChartSystem, buildTodaySystem, buildNumerologySystem } from "@/lib/astrology/prompt";
import { computeNumerology, computeNameNumber } from "@/lib/astrology/numerology";
import { transitChart, describeTransits, describeToday } from "@/lib/astrology/transits";
import type { Chart, Tradition, ChatMode } from "@/lib/astrology/types";
import { getOrCreateConversation, appendMessage, getMessages } from "@/lib/data/chat";
import { selectHistory } from "@/lib/data/history";

export const runtime = "nodejs";

/** A normal reading; "deep" buys a bigger model and room to say more. */
const WORDS_STANDARD = 160;
const WORDS_DEEP = 320;

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
  let messages: Anthropic.MessageParam[];
  // The system prompt is split so the stable half comes first and can sit
  // behind a cache breakpoint. Two breakpoints are set below: one after the
  // chart (which never changes for this user) and one after the last stored
  // turn. From the second message of a conversation onward the whole prefix —
  // chart, today, and history — is a cache read at a tenth of the input rate.
  // A first turn is short enough that missing the cache costs little.
  let stableSystem: string;
  let todaySystem: string;

  try {
    const { data: profile } = await supabase
      .from("birth_profiles")
      .select("first_name, last_name, birth_date, lat, lng, timezone, chart")
      .maybeSingle();
    if (!profile?.chart) return new Response("No chart. Complete intake first.", { status: 400 });

    // "Today"/"now" framed in the USER's timezone (e.g. IST), not the server's,
    // and only to the part of day — a clock time would change the prompt every
    // minute and defeat the cache for no gain in accuracy.
    const userTz = String(profile.timezone || "UTC");
    const nowLocal = DateTime.now().setZone(userTz);
    const today = describeToday({
      weekdayLongDate: nowLocal.toFormat("cccc, LLLL d, yyyy"),
      hour: nowLocal.hour,
      zone: userTz,
    });
    const num = computeNumerology(String(profile.birth_date));
    const maxWords = body.deep ? WORDS_DEEP : WORDS_STANDARD;

    if (body.tradition === "numerology") {
      const fullName = `${profile.first_name} ${profile.last_name}`.trim();
      stableSystem = buildNumerologySystem({
        firstName: profile.first_name,
        fullName,
        mulank: num.mulank,
        bhagyank: num.bhagyank,
        namank: computeNameNumber(fullName),
      });
      todaySystem = buildTodaySystem({ today, maxWords });
    } else {
      const chart = (profile.chart as { vedic: Chart; western: Chart })[body.tradition as Tradition];

      // Live transits, computed once per day per neighbourhood and shared.
      let transits: string | undefined;
      try {
        transits = describeTransits(
          await transitChart({
            lat: Number(profile.lat),
            lng: Number(profile.lng),
            tradition: body.tradition as Tradition,
          }),
        );
      } catch {
        transits = undefined;
      }

      stableSystem = buildChartSystem({
        firstName: profile.first_name,
        tradition: body.tradition as Tradition,
        chart,
        numerology: num,
      });
      todaySystem = buildTodaySystem({ today, transits, maxWords });
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
    // The budget bounds what a long conversation costs to resend each turn.
    const history = selectHistory(
      (await getMessages(conversationId, supabase)).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    );

    messages = history.map((turn, index) =>
      index === history.length - 1
        ? {
            role: turn.role,
            // Second breakpoint: everything up to the previous turn is a cache
            // hit on the next message in this conversation.
            content: [
              { type: "text" as const, text: turn.content, cache_control: { type: "ephemeral" as const } },
            ],
          }
        : { role: turn.role, content: turn.content },
    );
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
          // A ceiling, not a target — the length rule in the prompt is what
          // actually governs how much is generated, and output is the
          // expensive half of a reading.
          max_tokens: body.deep ? 3000 : 1600,
          // Only the deep (Opus) model supports adaptive thinking; Haiku rejects it.
          // The installed SDK's types predate "adaptive", so cast through unknown to
          // keep the runtime value exact while satisfying the older union at compile time.
          ...(supportsAdaptiveThinking(model)
            ? { thinking: { type: "adaptive" } as unknown as Anthropic.ThinkingConfigParam }
            : {}),
          // Routine readings think briefly; Deep pays for the full default.
          ...(body.deep ? {} : LOW_EFFORT),
          system: [
            {
              type: "text",
              text: stableSystem,
              // An hour, so a reply half an hour later still reads from cache
              // rather than paying full price for the chart again. Below the
              // API's minimum cacheable prefix this is simply ignored, which is
              // why the second breakpoint carries the conversation.
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
            { type: "text", text: todaySystem },
          ],
          messages,
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const usage = (await s.finalMessage()).usage;
        console.log(
          `chat usage conv=${conversationId} model=${model} in=${usage.input_tokens} ` +
            `cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} ` +
            `out=${usage.output_tokens}`,
        );
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
