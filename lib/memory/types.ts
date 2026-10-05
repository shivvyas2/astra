/**
 * Conversation summaries and the predictions ledger (0009_memory.sql), and
 * the validation that is the same whichever model wrote them — the server's
 * Haiku pass or the iPhone's on-device model. Nothing here touches the
 * network or a model.
 */
import type { FactCategory } from "@/lib/facts/types";

/** Matches the topic check constraint in 0009_memory.sql, in display order. */
export const TOPICS = [
  "career",
  "relationships",
  "money",
  "health",
  "home",
  "family",
  "children",
  "travel",
  "education",
  "general",
] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABEL: Record<Topic, string> = {
  career: "Career",
  relationships: "Relationships",
  money: "Money",
  health: "Health",
  home: "Home",
  family: "Family",
  children: "Children",
  travel: "Travel",
  education: "Study",
  general: "General",
};

export const CONFIDENCES = ["likely", "possible", "unlikely"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const PREDICTION_STATUSES = ["open", "happened", "didnt", "unsure"] as const;
export type PredictionStatus = (typeof PREDICTION_STATUSES)[number];

/** A row of `conversation_memories`. */
export type ConversationMemory = {
  conversation_id: string;
  summary: string;
  topics: Topic[];
  last_message_at: string;
};

/** A row of `predictions`. Dates are `yyyy-mm-dd`. */
export type Prediction = {
  id: string;
  conversation_id: string | null;
  topic: Topic;
  claim: string;
  window_start: string;
  window_end: string;
  confidence: Confidence;
  status: PredictionStatus;
  checked_at: string | null;
  created_at: string;
};

/** A prediction about to be written: validated, not yet stored. */
export type NewPrediction = Pick<Prediction, "topic" | "claim" | "window_start" | "window_end" | "confidence">;

/** Matches the check constraints in 0009_memory.sql. */
export const SUMMARY_MIN_CHARS = 3;
export const SUMMARY_MAX_CHARS = 600;
export const MAX_TOPICS = 6;
export const CLAIM_MIN_CHARS = 8;
export const CLAIM_MAX_CHARS = 280;
/** Predictions one turn may add. A reading commits to two or three. */
export const MAX_PREDICTIONS_PER_TURN = 4;
/** Open predictions a user keeps; past this a turn adds none. */
export const MAX_OPEN_PREDICTIONS = 80;

export function isTopic(value: unknown): value is Topic {
  return typeof value === "string" && (TOPICS as readonly string[]).includes(value);
}
export function isConfidence(value: unknown): value is Confidence {
  return typeof value === "string" && (CONFIDENCES as readonly string[]).includes(value);
}
export function isPredictionStatus(value: unknown): value is PredictionStatus {
  return typeof value === "string" && (PREDICTION_STATUSES as readonly string[]).includes(value);
}

/** The fact categories that are a topic on their own; the rest need their words read. */
export const CATEGORY_TOPIC: Partial<Record<FactCategory, Topic>> = {
  work: "career",
  relationships: "relationships",
  family: "family",
  health: "health",
  money: "money",
  home: "home",
};

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A summary trimmed to one paragraph, or null when there is nothing usable. */
export function cleanSummary(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = oneLine(raw);
  if (text.length < SUMMARY_MIN_CHARS || text.length > SUMMARY_MAX_CHARS) return null;
  return text;
}

/** Known topics, deduped, at most {@link MAX_TOPICS}. Unknown ones are dropped. */
export function cleanTopics(raw: unknown): Topic[] {
  if (!Array.isArray(raw)) return [];
  const out: Topic[] = [];
  for (const t of raw) {
    const value = typeof t === "string" ? t.trim().toLowerCase() : t;
    if (isTopic(value) && !out.includes(value)) out.push(value);
    if (out.length >= MAX_TOPICS) break;
  }
  return out;
}

const MONTH = /^(\d{4})-(\d{2})$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `yyyy-mm` or `yyyy-mm-dd` as a date. A bare month is its first day, or its
 * last when `end` is set, so "2027-03 to 2027-06" covers all of June.
 */
export function parseWindowDate(raw: unknown, end: boolean): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  let y: number, m: number, d: number;
  const day = DAY.exec(s);
  const month = MONTH.exec(s);
  if (day) {
    [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
  } else if (month) {
    [y, m] = [Number(month[1]), Number(month[2])];
    d = end ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 1;
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Astrology in a claim is fine — the claim is what the reading said will
 * happen, not why. But a claim that is only astrology ("Saturn enters the
 * 10th") is a transit, not a prediction about their life, so it must also
 * say something happens to them.
 */
const PURE_SKY =
  /^(the\s+)?(sun|moon|mars|mercury|jupiter|venus|saturn|rahu|ketu)\b.*\b(enters?|moves?|transits?|stations?|turns? (retrograde|direct)|ingress)\b/i;

/**
 * One prediction, validated: a known topic and confidence, a claim of the
 * right length, and a window that starts no more than a year back, ends no
 * more than ten years ahead, and spans at most five years. Null otherwise.
 */
export function cleanPrediction(raw: unknown, today: string): NewPrediction | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.claim !== "string") return null;
  const claim = oneLine(r.claim).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/\s*\.$/, "");
  if (claim.length < CLAIM_MIN_CHARS || claim.length > CLAIM_MAX_CHARS) return null;
  if (PURE_SKY.test(claim)) return null;
  const topic = typeof r.topic === "string" ? r.topic.trim().toLowerCase() : r.topic;
  if (!isTopic(topic) || !isConfidence(r.confidence)) return null;
  const start = parseWindowDate(r.window_start, false);
  const end = parseWindowDate(r.window_end, true);
  if (!start || !end || end < start) return null;
  const t = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const day = 86_400_000;
  if (Date.parse(start) < t - 366 * day) return null;
  if (Date.parse(end) > t + 3653 * day) return null;
  if (Date.parse(end) - Date.parse(start) > 1827 * day) return null;
  return { topic, claim, window_start: start, window_end: end, confidence: r.confidence };
}

/** "Mar–Jun 2027", "Dec 2026 – Feb 2027", "Mar 2027" — for the lists and the prompt. */
export function windowLabel(start: string, end: string): string {
  const fmt = (iso: string, withYear: boolean) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    return withYear ? `${month} ${d.getUTCFullYear()}` : month;
  };
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
  if (s.getUTCFullYear() === e.getUTCFullYear()) {
    if (s.getUTCMonth() === e.getUTCMonth()) return fmt(start, true);
    return `${fmt(start, false)}–${fmt(end, true)}`;
  }
  return `${fmt(start, true)} – ${fmt(end, true)}`;
}

const STATUS_LABEL: Record<PredictionStatus, string> = {
  open: "Open",
  happened: "Happened",
  didnt: "Didn't happen",
  unsure: "Not sure",
};
export function statusLabel(status: PredictionStatus): string {
  return STATUS_LABEL[status];
}

/** Open predictions first, soonest window first; then the settled ones, most recently checked first. */
export function orderPredictions(predictions: Prediction[]): Prediction[] {
  const open = predictions.filter((p) => p.status === "open").sort((a, b) => a.window_start.localeCompare(b.window_start));
  const closed = predictions
    .filter((p) => p.status !== "open")
    .sort((a, b) => (b.checked_at ?? b.created_at).localeCompare(a.checked_at ?? a.created_at));
  return [...open, ...closed];
}

/** Whether to ask "Did this happen?": still open, and its window has begun. */
export function canCheck(p: Prediction, today: string): boolean {
  return p.status === "open" && p.window_start <= today;
}
