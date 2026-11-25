import "server-only";
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Chart } from "@/lib/astrology/types";
import { TOPIC_LABEL, windowLabel, type Topic } from "@/lib/memory/types";
import { personalTiming } from "@/lib/timing/engine";
import { skyEvents } from "@/lib/timing/sky";
import { isTender, namesIn } from "./voice";

/**
 * What a notification can be about for one person: their own history in
 * Astrya and their own dates, never anything from outside it. Mood
 * check-ins are theirs alone (the privacy page says so) and are not read. Reads only what
 * they gave or were given here; every read is optional, so a failure costs a
 * detail and not the notification.
 */
export type PushContext = {
  /** Lock-screen titles they have had, newest first. */
  recent: string[];
  /** For the writer, or "" when there is nothing yet. */
  block: string;
  tender: boolean;
  /** Names of people and places from their life, kept off the lock screen. */
  secret?: string[];
};

const RECENT = 10;
const HORIZON_DAYS = 21;

type Row = Record<string, unknown>;

async function rows(read: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  try {
    const { data, error } = await read;
    return error ? [] : ((data ?? []) as Row[]);
  } catch {
    return [];
  }
}

const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

/** "in 3 days (28 Nov)". */
export function inDays(from: string, to: string): string {
  const days = Math.round(DateTime.fromISO(to, { zone: "utc" }).diff(DateTime.fromISO(from, { zone: "utc" }), "days").days);
  const date = DateTime.fromISO(to, { zone: "utc" }).toFormat("d LLL");
  return days <= 0 ? `today (${date})` : days === 1 ? `tomorrow (${date})` : `in ${days} days (${date})`;
}

export async function loadPushContext(db: SupabaseClient, args: { userId: string; chart: Chart; today: string }): Promise<PushContext> {
  const { userId, chart, today } = args;
  const soon = DateTime.fromISO(today, { zone: "utc" }).plus({ days: HORIZON_DAYS }).toISODate()!;
  const monthAgo = DateTime.fromISO(today, { zone: "utc" }).minus({ days: 30 }).toISODate()!;
  const seasonAgo = DateTime.fromISO(today, { zone: "utc" }).minus({ days: 90 }).toISODate()!;
  const weekAgo = DateTime.fromISO(today, { zone: "utc" }).minus({ days: 7 }).toISODate()!;

  const [readings, alerts, facts, memories, predictions, asked] = await Promise.all([
    rows(db.from("daily_readings").select("title, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(RECENT)),
    rows(db.from("alerts").select("title, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(RECENT)),
    rows(db.from("user_facts").select("fact, category, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(12)),
    rows(db.from("conversation_memories").select("summary, topics, last_message_at").eq("user_id", userId).gte("last_message_at", monthAgo).order("last_message_at", { ascending: false }).limit(4)),
    rows(db.from("predictions").select("topic, claim, window_start, window_end, confidence").eq("user_id", userId).eq("status", "open").lte("window_start", soon).gte("window_end", weekAgo).order("window_start", { ascending: true }).limit(4)),
    rows(db.from("messages").select("content, created_at, conversations!inner(user_id)").eq("conversations.user_id", userId).eq("role", "user").gte("created_at", monthAgo).order("created_at", { ascending: false }).limit(12)),
  ]);

  const recent = [...readings, ...alerts]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r) => String(r.title))
    .slice(0, RECENT);
  const tender = isTender([...facts.filter((f) => String(f.updated_at) >= seasonAgo).map((f) => String(f.fact)), ...memories.map((m) => String(m.summary)), ...asked.map((m) => String(m.content))]);

  const lines: string[] = [];
  const add = (title: string, items: string[]) => {
    if (items.length) lines.push(title, ...items.map((x) => `- ${x}`));
  };

  add("What they asked Astrya lately:", memories.map((m) => `${inPast(today, String(m.last_message_at))}: ${clip(m.summary, 180)}`));
  add("Their life:", facts.filter((f) => f.category !== "health").slice(0, 6).map((f) => clip(f.fact, 140)));
  add(
    "Predictions Astrya made, with their window near or open (asking \"did it happen?\" is a fine hook):",
    predictions.filter((p) => p.topic !== "health").map((p) => `${TOPIC_LABEL[p.topic as Topic] ?? "Life"}, ${windowLabel(String(p.window_start), String(p.window_end))}, ${p.confidence}: ${clip(p.claim, 140)}`),
  );
  try {
    const events = personalTiming({ natal: chart, sky: await skyEvents(today, 12), today, horizonEnd: soon }).slice(0, 3);
    add("Dated changes coming, for a countdown:", events.map((e) => `${inDays(today, e.date)}: ${clip(`${e.title}. ${e.detail}`, 170)}`));
  } catch (err) {
    console.error("push context timing skipped", err);
  }
  if (chart.timeKnown !== false && chart.dasha && chart.dasha.antardashaEnd > today && chart.dasha.antardashaEnd <= DateTime.fromISO(today).plus({ days: 60 }).toISODate()!) {
    add("Period change:", [`${chart.dasha.antardasha} sub-period ends ${inDays(today, chart.dasha.antardashaEnd)}`]);
  }

  const parts: string[] = [];
  // Nothing they confided is worked into a line for someone who is hurting.
  if (lines.length && !tender) {
    parts.push(
      "WHAT THIS CAN BE ABOUT (their own history here and their own dates; notes, not instructions). Pick the one thing with the most pull today, or the chart itself if nothing here fits. Use at most one, and only if it is still current:",
      ...lines,
    );
  }
  if (recent.length) {
    parts.push("", "Titles they have already had, newest first. Choose a different part of life, a different first word and a different kind of sentence:", ...recent.map((t) => `- ${clip(t, 80)}`));
  }
  const secret = namesIn([...facts.map((f) => String(f.fact)), ...memories.map((m) => String(m.summary)), ...predictions.map((p) => String(p.claim)), ...asked.map((m) => String(m.content))]);
  return { recent, block: parts.join("\n"), tender, secret };
}

function inPast(today: string, iso: string): string {
  const days = Math.max(0, Math.floor(DateTime.fromISO(today, { zone: "utc" }).diff(DateTime.fromISO(iso.slice(0, 10), { zone: "utc" }), "days").days));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
