import type Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { after } from "next/server";
import { createRouteSupabase } from "@/lib/supabase/route";
import { requireConsent } from "@/lib/billing/consent";
import { anthropic, READING_MODEL, DEEP_READING_MODEL, supportsAdaptiveThinking, READING_EFFORT, DEEP_EFFORT } from "@/lib/anthropic";
import {
  buildChartSystem,
  buildTodaySystem,
  buildNumerologySystem,
  buildMemorySystem,
  buildMemoryNote,
  systemBlocks,
  ageOn,
} from "@/lib/astrology/prompt";
import {
  computeNumerology,
  computeNameNumber,
  loShu,
  numberRelationship,
  personalCycle,
} from "@/lib/astrology/numerology";
import {
  transitChart,
  describeGochara,
  describeToday,
  describeUpcomingTransits,
  utcDayKey,
} from "@/lib/astrology/transits";
import { factsFor } from "@/lib/astrology/derived";
import type { Chart, Tradition, ChatMode } from "@/lib/astrology/types";
import { getOrCreateConversation, appendMessage, getMessages } from "@/lib/data/chat";
import { selectHistory, HISTORY_BUDGET_CHARS } from "@/lib/data/history";
import { loadTimeline } from "@/lib/timeline/load";
import type { Timeline } from "@/lib/timeline/build";
import { describeTimelineForPrompt, describeUpcomingPeriods } from "@/lib/timeline/describe";
import { ensureCurrentChart, type BirthProfileRow } from "@/lib/data/birthProfile";
import { loadFacts } from "@/lib/facts/store";
import { loadMemories, loadPredictions } from "@/lib/memory/store";
import { selectMemory } from "@/lib/memory/select";
import { rememberTurn } from "@/lib/memory/extract";
import { recordUsage, type UsageLike } from "@/lib/usage/record";
import { answerKey, claimAnswer, reuseAnswer } from "@/lib/usage/dedupe";
import { skyEvents } from "@/lib/timing/sky";
import { describeTiming, personalTiming } from "@/lib/timing/engine";

export const runtime = "nodejs";

/**
 * A normal reading; "deep" buys a bigger model and room to say more. Sized
 * for a committed answer — what, when, how sure, and the placement behind
 * it — rather than a general one, which is why they sit above the old 160/320.
 */
const WORDS_STANDARD = 190;
const WORDS_DEEP = 360;

/**
 * How far ahead the sky is sampled for the UPCOMING block, in days. Four
 * points are enough to date a slow body's next sign change or station to the
 * month, and each is one cached ephemeris run per day per neighbourhood.
 */
const UPCOMING_SAMPLE_DAYS = [30, 90, 180, 365];

export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // AI consent (App Store 5.1.2): 403 consent_required until the user has
  // agreed to the current notice. Fails open while ai_consents is missing.
  const consentBlock = await requireConsent(supabase, user.id);
  if (consentBlock) return consentBlock;

  const body = (await request.json()) as {
    conversationId?: string;
    tradition: ChatMode;
    message: string;
    deep?: boolean;
    /**
     * "on-device": the iPhone will work out this turn's memory (facts,
     * summary, predictions) with Apple's on-device model and post it to
     * /api/memory/ingest, so the server's Haiku pass is skipped.
     */
    memory?: string;
  };
  if (!body.message?.trim()) return new Response("Empty message", { status: 400 });
  if (!["vedic", "western", "numerology"].includes(body.tradition)) {
    return new Response("Invalid mode", { status: 400 });
  }

  // The same question twice (a retry after a dropped connection, a double
  // tap) is answered once and paid for once. See lib/usage/dedupe.ts.
  const dedupeKey = answerKey({
    userId: user.id,
    conversationId: body.conversationId,
    tradition: body.tradition,
    deep: body.deep,
    message: body.message,
  });
  const reused = await reuseAnswer(dedupeKey);
  if (reused) {
    return new Response(reused.text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-conversation-id": reused.conversationId,
        "cache-control": "no-store",
      },
    });
  }
  const claim = claimAnswer(dedupeKey);

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
  // What Astrya remembers from earlier conversations (lib/memory): the
  // standing notes as a system block, and what this question makes relevant
  // as a note on the newest message. Both empty when there is nothing — or no
  // memory tables yet — which leaves the request exactly as it was before.
  let memorySystem = "";
  let memoryNote = "";
  // For the learn-from-chats pass after the reading: their local date, and
  // the reply their new message is answering.
  let localDate = "";
  let previousReply: string | null = null;

  try {
    const { data: loaded, error: profileError } = await supabase
      .from("birth_profiles")
      .select("user_id, first_name, last_name, birth_date, birth_time, lat, lng, timezone, chart")
      .maybeSingle();
    if (profileError) {
      console.error("chat profile read error", profileError);
      claim.settle(null);
      return new Response("Something went wrong loading your profile. Please try again.", { status: 500 });
    }
    if (!loaded?.chart) {
      claim.settle(null);
      return new Response("No chart. Complete intake first.", { status: 400 });
    }
    const profile = await ensureCurrentChart(loaded as BirthProfileRow, supabase);
    // Started now, awaited once the chart work is done. None of them reject.
    const memoryLoad = Promise.all([loadFacts(supabase), loadMemories(supabase), loadPredictions(supabase)]);

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
    // Their age in whole years, on their own calendar date. Volatile only on
    // a birthday, but it belongs with "today" rather than with the chart.
    const age = ageOn(String(profile.birth_date), nowLocal);
    localDate = nowLocal.toISODate() ?? utcDayKey();

    if (body.tradition === "numerology") {
      const fullName = `${profile.first_name} ${profile.last_name}`.trim();
      const namank = computeNameNumber(fullName);
      stableSystem = buildNumerologySystem({
        firstName: profile.first_name,
        fullName,
        mulank: num.mulank,
        bhagyank: num.bhagyank,
        namank,
        grid: loShu(String(profile.birth_date)),
        namankToMulank: numberRelationship(namank, num.mulank),
      });
      todaySystem = buildTodaySystem({
        today,
        age,
        maxWords,
        personal: personalCycle(String(profile.birth_date), nowLocal.toFormat("yyyy-LL-dd")),
      });
    } else {
      const tradition = body.tradition as Tradition;
      const chart = (profile.chart as { vedic: Chart; western: Chart })[tradition];
      // factsFor gates on chart.tradition, so this is undefined for western —
      // Western readings get no derived facts (no Vedic lordship, aspect,
      // dignity, or dosha technique). See lib/astrology/derived.ts.
      const derived = factsFor(chart);
      const place = { lat: Number(profile.lat), lng: Number(profile.lng), tradition };

      // Live transits, computed once per day per neighbourhood and shared.
      let transits: string | undefined;
      let todaySky: Chart | undefined;
      try {
        todaySky = await transitChart(place);
        transits = describeGochara(chart, todaySky);
      } catch {
        transits = undefined;
      }

      // The same sky sampled months ahead, so a prediction can date the next
      // sign change or station. Its own try/catch: losing it should not take
      // SKY TODAY with it.
      let upcomingTransits = "";
      if (tradition === "vedic") {
        // The timing engine: every ingress and station over the next year,
        // settled to the day and read against this chart. The dasha lines
        // come from describeUpcomingPeriods below, so only the sky is asked for.
        try {
          const day = localDate;
          const sky = await skyEvents(day, 12);
          const horizonEnd = DateTime.fromISO(day).plus({ months: 12 }).toISODate()!;
          upcomingTransits = describeTiming(personalTiming({ natal: chart, sky, today: day, horizonEnd }));
        } catch (err) {
          console.error("chat timing engine skipped", err);
        }
      } else if (todaySky) {
        try {
          const samples = await Promise.all(
            UPCOMING_SAMPLE_DAYS.map(async (days) => {
              const day = DateTime.utc().plus({ days }).toISODate()!;
              return { day, chart: await transitChart({ ...place, day }) };
            }),
          );
          upcomingTransits = describeUpcomingTransits(chart, todaySky, samples);
        } catch (err) {
          console.error("chat upcoming transits skipped", err);
        }
      }

      stableSystem = buildChartSystem({
        firstName: profile.first_name,
        tradition,
        chart,
        derived,
        numerology: num,
      });

      // What has actually happened in their life, so "why was 2021 so hard"
      // is answered against their 2021 and not a generic one. Loaded once and
      // used twice: the moments go in the cached block, which only changes
      // when they pin or remove one, and the period changes ahead go in the
      // volatile block, because they are phrased relative to today.
      let timeline: Timeline | null = null;
      try {
        timeline = await loadTimeline(supabase);
      } catch (err) {
        console.error("chat timeline context skipped", err);
      }
      if (timeline) stableSystem += describeTimelineForPrompt(timeline, { tradition });

      // Dasha sub-periods are Vedic, as describeTimelineForPrompt already
      // treats them; a Western reading gets the dated sky alone.
      const upcomingPeriods =
        timeline && tradition === "vedic"
          ? describeUpcomingPeriods(timeline, nowLocal.toISODate() ?? utcDayKey())
          : "";
      const upcoming = [upcomingTransits, upcomingPeriods].filter(Boolean).join("\n");

      todaySystem = buildTodaySystem({ today, age, transits, upcoming, maxWords });
    }

    const [{ facts }, { memories }, { predictions }] = await memoryLoad;
    const memory = selectMemory({
      facts,
      memories,
      predictions,
      question: body.message,
      conversationId: body.conversationId,
      today: localDate,
    });
    memorySystem = buildMemorySystem({ memory, mode: body.tradition });
    memoryNote = buildMemoryNote({ memory });

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
      HISTORY_BUDGET_CHARS,
      // Holds the window's first turn still across exchanges so long chats
      // keep reading their history from cache; keeps more, never less.
      { cacheStable: true },
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
    previousReply = [...history].reverse().find((turn) => turn.role === "assistant")?.content ?? null;
    // The question-specific notes ride on this turn only: they sit after the
    // conversation's cache breakpoint and are never stored, so next turn's
    // history (and its cache) is unaffected.
    messages.push({
      role: "user",
      content: memoryNote
        ? [
            { type: "text" as const, text: memoryNote },
            { type: "text" as const, text: body.message },
          ]
        : body.message,
    });
    await appendMessage(conversationId, "user", body.message, supabase);
  } catch (err) {
    console.error("chat pre-stream error", err);
    claim.settle(null);
    return new Response("Something went wrong preparing your reading. Please try again.", { status: 500 });
  }

  const model = body.deep ? DEEP_READING_MODEL : READING_MODEL;

  // Resolves with the reading's text when it has finished streaming (empty
  // if it produced none). The memory pass waits on it.
  let readingDone: (text: string) => void = () => {};
  const readingFinished = new Promise<string>((resolve) => {
    readingDone = resolve;
  });

  // The reading's billed usage, recorded to model_usage once it is out.
  let readingUsage: UsageLike | null = null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      let finished = false;
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
          // Routine readings think at medium; Deep at high.
          ...(body.deep ? DEEP_EFFORT : READING_EFFORT),
          // Chart (cached for an hour), then what Astrya remembers, then the
          // day. See systemBlocks in lib/astrology/prompt.ts.
          system: systemBlocks({ stable: stableSystem, memory: memorySystem, today: todaySystem }),
          messages,
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const usage = (await s.finalMessage()).usage;
        readingUsage = usage;
        finished = true;
        console.log(
          `chat usage conv=${conversationId} model=${model} in=${usage.input_tokens} ` +
            `cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} ` +
            `out=${usage.output_tokens}`,
        );
      } catch (err) {
        console.error("chat stream error", err);
        controller.enqueue(encoder.encode("\n\n[The stars are momentarily clouded. Please try again.]"));
      } finally {
        try {
          if (full.trim()) await appendMessage(conversationId, "assistant", full, supabase);
        } finally {
          // Signalled first: close() throws if the client has already gone,
          // and the memory pass must not be left waiting on it.
          readingDone(full.trim() ? full : "");
          claim.settle(finished && full.trim() ? { text: full, conversationId } : null);
          controller.close();
        }
      }
    },
  });

  // Memory: once the reading is out, one cheap Haiku call keeps the facts,
  // this conversation's summary and the predictions ledger current
  // (lib/memory/extract.ts). `after` runs it once the response is sent, so it
  // never delays a reading, and the pass itself never throws. A turn that
  // produced no reading teaches nothing, and a turn the iPhone is
  // remembering on-device is not paid for twice.
  const onDevice = body.memory === "on-device";
  const remember = async () => {
    const reply = await readingFinished;
    if (readingUsage) {
      await recordUsage({
        userId: user.id,
        kind: body.deep ? "deep_reading" : "reading",
        model,
        usage: readingUsage,
        conversationId,
      });
    }
    if (!reply || onDevice) return;
    await rememberTurn({
      db: supabase,
      userId: user.id,
      conversationId,
      message: body.message,
      reply,
      previousReply,
      today: localDate,
    });
  };
  try {
    after(remember);
  } catch (err) {
    // Outside a request scope (never in production). Losing one pass is fine.
    console.error("memory pass not scheduled", err);
  }

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-conversation-id": conversationId,
      "cache-control": "no-store",
    },
  });
}
