/**
 * The admin JSON API contract (/api/admin/*). The iOS admin decodes exactly
 * these shapes, and the web admin renders them, so change both sides together.
 *
 * Numbers are numbers, dates ISO strings, money USD numbers. Strings that may
 * be unknown (name, place, email) are "" rather than null; only fields marked
 * `| null` are ever null.
 */

import type { AiHealth } from "@/lib/health/ai";

export type Mode = "vedic" | "western" | "numerology";
export type UsageKindName = "reading" | "deep_reading" | "memory" | "daily" | "alert" | "extraction" | "other";

export type AdminMe = { isAdmin: boolean };

export type OverviewTotals = {
  users: number;
  newUsers: number;
  activeUsers7d: number;
  readings: number;
  readingsToday: number;
  /** Deep readings as a share (0..1) of readings recorded in model_usage in the window. */
  deepShare: number;
  costUsd: number;
  costToday: number;
  /** All model spend in the window divided by readings in the window. */
  costPerReading: number;
  facts: number;
  conversationMemories: number;
  predictionsOpen: number;
  predictionsHappened: number;
  predictionsDidnt: number;
  predictionHitRate: number | null;
  dailyReadings: number;
  alertsSent: number;
  pushDevices: number;
  lifeEvents: number;
  /** Users flagged "Heavy use" (see HEAVY_USE in lib/admin/stats.ts). */
  heavyUsers: number;
};

export type Overview = {
  generatedAt: string;
  days: number;
  totals: OverviewTotals;
  /** Whether the AI is answering; null when it cannot be told. */
  ai: AiHealth | null;
  series: { day: string; signups: number; readings: number; costUsd: number; activeUsers: number }[];
  modes: { mode: Mode; readings: number }[];
  models: { model: string; calls: number; costUsd: number }[];
  kinds: { kind: UsageKindName; calls: number; costUsd: number }[];
  /** Top 10 by 30-day spend. `heavy` is extra to the original contract. */
  topUsers: { id: string; name: string; email: string; costUsd30d: number; readings30d: number; heavy: boolean }[];
};

/** The way in, in order. */
export const STAGES = ["signed_up", "signed_in", "profile", "consented", "asked", "returned"] as const;
export type Stage = (typeof STAGES)[number];

export type Flagged = { id: string; name: string; email: string; reasons: string[] };

/** The web admin's growth, funnel, failures and flags. Not part of the iOS contract. */
export type Pulse = {
  days: number;
  /** Daily opens are being counted (migration 0021). */
  counting: boolean;
  totals: { users: number; joinedToday: number; joined7: number; activeToday: number; active7: number; active30: number };
  series: { day: string; total: number; joined: number; active: number }[];
  funnel: { stage: Stage; reached: number; lost: number }[];
  /** The step that loses the most people. */
  worst: Stage | null;
  failures: {
    questions: number;
    unanswered: number;
    people: number;
    recent: { conversationId: string; userId: string; name: string; at: string }[];
    neverConfirmed: number;
  };
  flags: { offTopic7: number; instructions7: number; abuse7: number; users: Flagged[] };
};

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  place: string;
  createdAt: string;
  lastActiveAt: string | null;
  plan: "free" | "plus";
  readings: number;
  readings7d: number;
  costUsd30d: number;
  facts: number;
  predictionsOpen: number;
  hasPush: boolean;
  isAdmin: boolean;
  /** Extra to the original contract: flagged "Heavy use". */
  heavy: boolean;
  /** Extra to the original contract: how far they got. Absent for admins. */
  stage?: Stage;
};

export type AdminUsers = { users: AdminUserRow[]; total: number };

export type TimelineKind =
  | "signup"
  | "reading"
  | "deep_reading"
  | "daily"
  | "alert"
  | "life_event"
  | "prediction"
  | "prediction_resolved"
  | "fact";

export type TimelineEvent = { at: string; kind: TimelineKind; title: string; detail: string; refId: string | null };

export type AdminUserDetail = {
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    lastActiveAt: string | null;
    plan: "free" | "plus";
    isAdmin: boolean;
    /** Extra to the original contract: flagged "Heavy use". */
    heavy: boolean;
    birth: { date: string; time: string; timeKnown: boolean; place: string; timezone: string } | null;
    chart: {
      lagna: string;
      moonSign: string;
      sunSign: string;
      mahadasha: string;
      antardasha: string;
      antardashaEnd: string;
    } | null;
  };
  stats: {
    readings: number;
    deepReadings: number;
    costUsd: number;
    costUsd30d: number;
    facts: number;
    summaries: number;
    predictionsOpen: number;
    predictionsHappened: number;
    predictionsDidnt: number;
    lifeEvents: number;
    alerts: number;
    dailyReadings: number;
    pushDevices: number;
  };
  timeline: TimelineEvent[];
  conversations: { id: string; title: string; mode: Mode; createdAt: string; lastMessageAt: string | null; messages: number }[];
  memory: {
    facts: { id: string; fact: string; category: string; confidence: string; source: string; updatedAt: string }[];
    summaries: { conversationId: string; summary: string; topics: string[]; lastMessageAt: string }[];
    predictions: {
      id: string;
      topic: string;
      claim: string;
      windowStart: string;
      windowEnd: string;
      confidence: string;
      status: string;
      checkedAt: string | null;
    }[];
  };
  usage: { day: string; readings: number; costUsd: number }[];
};

export type AdminConversation = {
  conversation: { id: string; userId: string; title: string; mode: Mode; createdAt: string };
  messages: { role: "user" | "assistant"; content: string; createdAt: string }[];
};
