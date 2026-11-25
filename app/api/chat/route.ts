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
import { getOrCreateConversation, getConversationPerson, setConversationPerson, appendMessage, getMessages } from "@/lib/data/chat";
import { createPerson, getPerson, listPeople, parsePersonInput } from "@/lib/profiles/store";
import type { PersonRow } from "@/lib/profiles/types";
import { FAILED_MARK } from "@/lib/compat/matchCard";
import { CARD_SEPARATOR, parseDetailsLine, plain, readProposal, reply as matchReply, resolvePlaces, type Reply } from "@/lib/compat/chatMatch";
import { describeSavedPeople, MATCH_TOOLS } from "@/lib/compat/chatTools";
import { geocodePlace } from "@/lib/geo";
import { computeCompatibility, type ChartPair } from "@/lib/compat/compatibility";
import { describeMatchForPrompt } from "@/lib/compat/prompt";
import { withoutCharts } from "@/lib/lookups/chartBlock";
import { readLookup, runLookup, type Subject } from "@/lib/lookups/run";
import { LOOKUP_RULES, LOOKUP_TOOL } from "@/lib/lookups/tool";
import { chatLanguageRule, isReadingLanguage, loadReadingLanguage, type ReadingLanguage } from "@/lib/astrology/language";
import { localeForLanguage } from "@/lib/i18n/config";
import { messagesFor } from "@/lib/i18n/dictionaries";
import { selectHistory, HISTORY_BUDGET_CHARS } from "@/lib/data/history";
import { loadTimeline } from "@/lib/timeline/load";
import type { Timeline } from "@/lib/timeline/build";
import { describeTimelineForPrompt, describeUpcomingPeriods } from "@/lib/timeline/describe";
import { ensureCurrentChart, type BirthProfileRow } from "@/lib/data/birthProfile";
import { loadFacts } from "@/lib/facts/store";
import { loadMemories, loadPredictions } from "@/lib/memory/store";
import { selectMemory } from "@/lib/memory/select";
import { rememberTurn } from "@/lib/memory/extract";
import { addUsage } from "@/lib/usage/add";
import { recordUsage, type UsageLike } from "@/lib/usage/record";
import { answerKey, claimAnswer, reuseAnswer } from "@/lib/usage/dedupe";
import { guardUsage, limitResponse } from "@/lib/usage/limits";
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

/** Model calls one message may make: a match, a look-up, one to recover from a tool error, one to answer. */
const TOOL_ROUNDS = 4;

/** Younger than this, a saved birth year is a slip rather than a person asking for readings. */
const IMPLAUSIBLE_AGE = 5;

/**
 * How far ahead the sky is sampled for the UPCOMING block, in days. Four
 * points are enough to date a slow body's next sign change or station to the
 * month, and each is one cached ephemeris run per day per neighbourhood.
 */
const UPCOMING_SAMPLE_DAYS = [30, 90, 180, 365];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    /**
     * Makes this a match reading about the user and this saved person: a new
     * conversation starts with them, an existing one takes them on (the
     * confirm card). Without it a conversation keeps the person it has.
     */
    personId?: string;
    /** This client draws the confirm card (lib/compat/matchCard.ts). */
    cards?: boolean;
    /** Overrides the stored reading language for this turn. */
    language?: string;
  };
  if (!body.message?.trim()) return new Response("Empty message", { status: 400 });
  const askedPersonId = UUID.test(body.personId ?? "") ? body.personId! : null;
  const newPersonId = body.conversationId ? null : askedPersonId;
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
    personId: askedPersonId,
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
  // The daily limits set in the admin (lib/usage/limits.ts). After the reuse
  // above, so a retry of an answer already paid for is never refused.
  const limit = await guardUsage(user.id, { reading: true });
  if (limit.block) return limitResponse(limit.block, body.language ?? limit.language);

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
  // Appended to a reading the stream drops, in the reader's language.
  let streamError = messagesFor("en").chat.streamError;
  // For the learn-from-chats pass after the reading: their local date, and
  // the reply their new message is answering.
  let localDate = "";
  let previousReply: string | null = null;
  // Bringing a second chart into the conversation (lib/compat/chatTools.ts).
  // Null in numerology, which has no charts to match.
  let matchWith: ((person: PersonRow) => string | null) | null = null;
  let attachPersonId: string | null = null;
  let replyLanguage: ReadingLanguage = "english";
  // What look_up may compute from (lib/lookups). Vedic only.
  let lookups: { self: Subject; other: Subject | null } | null = null;

  try {
    const { data: loaded, error: profileError } = await supabase
      .from("birth_profiles")
      .select("user_id, first_name, last_name, birth_date, birth_time, place_name, lat, lng, timezone, chart, updated_at")
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
    const profile = await ensureCurrentChart(loaded as unknown as BirthProfileRow, supabase);
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
      if (tradition === "vedic") {
        stableSystem += LOOKUP_RULES;
        lookups = { self: subjectOf({ ...profile, label: profile.first_name }, chart), other: null };
      }

      // A match reading: the other person's chart and the scores from the
      // two, after the user's own. A person deleted since, or a database
      // without migration 0015, leaves an ordinary reading.
      const you = profile;
      matchWith = (person) => {
        if (!person.chart) return null;
        const theirs = person.chart as unknown as ChartPair;
        const name = person.label || person.first_name;
        const compat = computeCompatibility({
          you: { name: you.first_name, chart: you.chart as unknown as ChartPair },
          them: { name, relationship: person.relationship, chart: theirs },
          groom: "you",
        });
        const theirChart = tradition === "western" && theirs.western ? theirs.western : theirs.vedic;
        return describeMatchForPrompt({
          you: you.first_name,
          them: { name, relationship: person.relationship, chart: theirChart },
          tradition,
          compat,
        });
      };
      const personId = askedPersonId ?? (body.conversationId ? await getConversationPerson(body.conversationId, supabase) : null);
      let personInPrompt: string | null = null;
      if (personId) {
        try {
          const { person } = await getPerson(supabase, personId);
          const block = person ? matchWith(person) : null;
          if (block) {
            stableSystem += block;
            personInPrompt = personId;
            if (lookups && person) lookups.other = subjectOf(person, (person.chart as unknown as ChartPair).vedic);
            if (body.conversationId && askedPersonId) attachPersonId = personId;
          }
        } catch (err) {
          console.error("chat match context skipped", err);
        }
      }

      // Dasha sub-periods are Vedic, as describeTimelineForPrompt already
      // treats them; a Western reading gets the dated sky alone.
      const upcomingPeriods =
        timeline && tradition === "vedic"
          ? describeUpcomingPeriods(timeline, nowLocal.toISODate() ?? utcDayKey())
          : "";
      const upcoming = [upcomingTransits, upcomingPeriods].filter(Boolean).join("\n");

      todaySystem = buildTodaySystem({ today, age, transits, upcoming, maxWords });
      // Saved people change, so they sit with the day, after the cached chart.
      const { people } = await listPeople(supabase);
      todaySystem += describeSavedPeople(people, personInPrompt);
    }
    if (age !== undefined && age < IMPLAUSIBLE_AGE) {
      todaySystem += `\n\nTheir saved birth year, ${String(profile.birth_date).slice(0, 4)}, makes them ${age}, so it is almost certainly a slip and this chart is not theirs. Open by saying so in one sentence and asking them to correct the birth date in their profile. Keep the rest short and state no age.`;
    }

    // Last in the volatile block: changing language never invalidates the
    // cached chart above it.
    const language = isReadingLanguage(body.language) ? body.language : await loadReadingLanguage(supabase);
    replyLanguage = language;
    todaySystem += chatLanguageRule(language);
    streamError = messagesFor(localeForLanguage(language)).chat.streamError;

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
        personId: newPersonId,
      },
      supabase,
    );

    if (attachPersonId) await setConversationPerson({ userId: user.id, conversationId, personId: attachPersonId }, supabase);

    // Build history from persisted messages, then append the new user turn.
    // The budget bounds what a long conversation costs to resend each turn.
    const rows = await getMessages(conversationId, supabase);
    const stored = rows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.role === "assistant" ? withoutCharts(m.content) : m.content,
    }));
    // Their birth details were edited part way through: the earlier replies
    // read another chart, which is not Astrya's mistake to apologise for.
    const editedAt = Date.parse(String(profile.updated_at ?? ""));
    if (rows.some((m) => m.role === "assistant" && Date.parse(String(m.created_at)) < editedAt)) {
      todaySystem +=
        "\n\nTheir profile was saved again after some of your earlier replies here. The chart above is the current one. If an earlier reply named different placements or dates, their birth details changed since: say that once in one clause and read from the current chart. Do not apologise or call the earlier reply a mistake.";
    }
    // The same question again after it went unanswered (Try again): already
    // stored, so neither sent nor saved a second time.
    const last = stored.at(-1);
    const retrying = last?.role === "user" && last.content === body.message;
    if (retrying) stored.pop();
    const history = selectHistory(
      stored,
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
    if (!retrying) await appendMessage(conversationId, "user", body.message, supabase);
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
      // Whether it has said anything: a drawn chart alone is not a reading.
      let spoke = false;
      // A reader who locks their phone closes the stream. The reading still
      // finishes and is saved, so it is there when they come back.
      const push = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The client has gone.
        }
      };
      try {
        // Usually one call. A match adds a second, with the other chart in a
        // tool result; the last round may not call a tool, so it must answer.
        const turns = [...messages];
        for (let round = 1; round <= TOOL_ROUNDS; round++) {
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
            ...(matchWith
              ? {
                  tools: lookups ? [...MATCH_TOOLS, LOOKUP_TOOL] : MATCH_TOOLS,
                  tool_choice:
                    round < TOOL_ROUNDS
                      ? { type: "auto" as const, disable_parallel_tool_use: true }
                      : { type: "none" as const },
                }
              : {}),
            // Chart (cached for an hour), then what Astrya remembers, then the
            // day. See systemBlocks in lib/astrology/prompt.ts.
            system: systemBlocks({ stable: stableSystem, memory: memorySystem, today: todaySystem }),
            messages: turns,
          });
          for await (const event of s) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              full += event.delta.text;
              spoke ||= event.delta.text.trim() !== "";
              push(event.delta.text);
            }
          }
          const final = await s.finalMessage();
          readingUsage = addUsage(readingUsage, final.usage);
          const call =
            final.stop_reason === "tool_use"
              ? final.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
              : undefined;
          if (!call || !matchWith) break;

          const outcome = call.name === LOOKUP_TOOL.name && lookups ? await lookUp(call, lookups, localDate) : await runMatchTool(call, {
            userId: user.id,
            conversationId,
            previousReply,
            cards: body.cards === true,
            language: replyLanguage,
            describe: matchWith,
            onAdopt: (person) => {
              if (lookups) lookups.other = subjectOf(person, (person.chart as unknown as ChartPair).vedic);
            },
            db: supabase,
          });
          if (outcome.kind === "reply") {
            const text = `${full.trim() ? "\n\n" : ""}${outcome.reply.text}`;
            full += text;
            spoke = true;
            push(text);
            if (outcome.reply.card) {
              push(CARD_SEPARATOR + JSON.stringify(outcome.reply.card));
            }
            break;
          }
          for (const block of outcome.blocks ?? []) {
            const text = `${full.trim() ? "\n\n" : ""}${block}\n\n`;
            full = full.trimEnd() + text;
            push(text);
          }
          turns.push(
            { role: "assistant", content: final.content },
            {
              role: "user",
              content: [
                { type: "tool_result", tool_use_id: call.id, content: outcome.content, ...(outcome.error ? { is_error: true } : {}) },
              ],
            },
          );
        }
        const usage: UsageLike = readingUsage ?? {};
        if (!spoke) throw new Error("empty reading");
        finished = true;
        console.log(
          `chat usage conv=${conversationId} model=${model} in=${usage.input_tokens} ` +
            `cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} ` +
            `out=${usage.output_tokens}`,
        );
      } catch (err) {
        console.error("chat stream error", err);
        // A client that can offer Try again is told so; others get a line of text.
        push(body.cards === true ? FAILED_MARK : `\n\n${streamError}`);
      } finally {
        try {
          // Half a reading is not kept: the question stays unanswered, and
          // Try again asks it afresh.
          if (finished) await appendMessage(conversationId, "assistant", full, supabase);
        } finally {
          // Signalled first: close() throws if the client has already gone,
          // and the memory pass must not be left waiting on it.
          readingDone(finished ? withoutCharts(full) : "");
          claim.settle(finished && full.trim() ? { text: full, conversationId } : null);
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
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

type MatchOutcome =
  /** The reply is complete: a read-back or a question, written by code. */
  | { kind: "reply"; reply: Reply }
  /** Hand this back to the model and let it answer. */
  | { kind: "result"; content: string; error?: boolean; /** Charts for the reply, before its words. */ blocks?: string[] };

/** A person's details as look_up needs them. */
function subjectOf(
  row: { label?: string; first_name: string; birth_date: string; birth_time: string; timezone: string; place_name: string; lat: number; lng: number },
  chart: Chart,
): Subject {
  return {
    name: row.label || row.first_name,
    chart,
    birthDate: String(row.birth_date),
    birthTime: String(row.birth_time),
    timezone: String(row.timezone || "UTC"),
    place: { name: String(row.place_name ?? ""), lat: Number(row.lat), lng: Number(row.lng) },
  };
}

/** Runs look_up. Never throws: a failure is told to the model. */
async function lookUp(call: Anthropic.ToolUseBlock, people: { self: Subject; other: Subject | null }, today: string): Promise<MatchOutcome> {
  const input = readLookup(call.input);
  if (!input) return { kind: "result", content: "That did not arrive in the right shape. Call look_up again.", error: true };
  try {
    return { kind: "result", ...(await runLookup(input, { ...people, today, find: async (place) => (await resolvePlaces(place, geocodePlace)).places })) };
  } catch (err) {
    console.error("chat lookup failed", input.topics.join(","), err);
    return { kind: "result", content: "That could not be computed just now. Say so plainly and answer what the chart above shows.", error: true };
  }
}

/** Runs one of MATCH_TOOLS. Never throws: a failure is told to the model. */
async function runMatchTool(
  call: Anthropic.ToolUseBlock,
  ctx: {
    userId: string;
    conversationId: string;
    previousReply: string | null;
    cards: boolean;
    language: ReadingLanguage;
    describe: (person: PersonRow) => string | null;
    onAdopt: (person: PersonRow) => void;
    db: Awaited<ReturnType<typeof createRouteSupabase>>;
  },
): Promise<MatchOutcome> {
  const fail = (content: string): MatchOutcome => ({ kind: "result", content, error: true });
  const find = (place: string) => resolvePlaces(place, geocodePlace);
  const adopt = async (person: PersonRow): Promise<MatchOutcome> => {
    const block = ctx.describe(person);
    if (!block) return fail("Their chart could not be read. Say so plainly and ask them to check the details under People.");
    await setConversationPerson({ userId: ctx.userId, conversationId: ctx.conversationId, personId: person.id }, ctx.db);
    ctx.onAdopt(person);
    return { kind: "result", content: `${block}\n\nAnswer their question now, from both charts.` };
  };

  try {
    if (call.name === "propose_match") {
      const proposal = readProposal(call.input);
      if (!proposal) return fail("Those details did not arrive in the right shape. Call propose_match again.");
      const locale = localeForLanguage(ctx.language);
      return { kind: "reply", reply: await matchReply(proposal, { cards: ctx.cards, locale, find }) };
    }

    if (call.name === "confirm_match") {
      const details = parseDetailsLine(ctx.previousReply);
      if (!details) return fail("Your last message did not read back any details, so there is nothing to confirm. Call propose_match with what they have told you.");
      const place = (await find(details.place)).places[0];
      if (!place || plain(place.name, 160) !== details.place) {
        return fail("The birthplace could not be looked up again. Call propose_match with the same details.");
      }
      const parsed = parsePersonInput({
        label: details.name,
        relationship: details.relationship,
        first_name: details.name,
        birth_date: details.birthDate,
        birth_time: details.birthTime ?? "",
        birth_time_known: details.timeKnown,
        place_name: place.name,
        lat: place.lat,
        lng: place.lng,
        timezone: place.timezone,
      });
      if (!parsed.ok) return fail("Those details could not be saved. Call propose_match again.");
      // A second "yes", or a retry, finds the person the first one saved.
      const { people } = await listPeople(ctx.db);
      const same = people.find(
        (p) =>
          p.first_name === parsed.value.firstName &&
          String(p.birth_date) === parsed.value.birthDate &&
          String(p.birth_time).slice(0, 5) === parsed.value.birthTime &&
          p.place_name === parsed.value.placeName,
      );
      if (same) {
        const { person } = await getPerson(ctx.db, same.id);
        if (person) return await adopt(person);
      }
      const saved = await createPerson(ctx.db, ctx.userId, parsed.value);
      if (!saved.ok) {
        return fail(
          saved.reason === "ceiling"
            ? "They have saved as many people as one account can hold. Tell them to remove someone under People first."
            : "The details could not be saved just now. Say so and ask them to try again in a moment.",
        );
      }
      return await adopt(saved.person);
    }

    if (call.name === "use_saved_person") {
      const id = String((call.input as { person_id?: unknown } | null)?.person_id ?? "");
      const { person } = UUID.test(id) ? await getPerson(ctx.db, id) : { person: null };
      if (!person) return fail("No saved person has that id. Use an id from OTHER PEOPLE, or call propose_match.");
      return await adopt(person);
    }
    return fail("There is no such tool.");
  } catch (err) {
    console.error("chat match tool failed", call.name, err);
    return fail("That did not work just now. Say so plainly and answer what you can from their own chart.");
  }
}
