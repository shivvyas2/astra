import "server-only";
import { getPlan, type Plan } from "@/lib/billing/plan";
import { isMissingRelation } from "@/lib/usage/record";
import type {
  AdminConversation,
  AdminUserDetail,
  AdminUserRow,
  AdminUsers,
  Mode,
  Overview,
  TimelineEvent,
  UsageKindName,
} from "./types";

/**
 * Everything the admin reads, for the JSON API and the web admin alike.
 *
 * Reads with the service role, so admins see every user's transcripts and
 * memory (facts, summaries, predictions) — the owner's decision, stated in the
 * README's privacy section. RLS is unchanged; no user session can do this.
 *
 * Production can lag the repo's migrations, so every table is optional: a
 * missing or failing table reads as empty (logged once per table), and each
 * section degrades to zeros rather than failing the page. Aggregation is done
 * here in TypeScript over paged reads, which is fine at today's size; swap a
 * section for an SQL view when it is not.
 */

// supabase-js clients (service role) and test fakes alike.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminDb = { from(table: string): any; auth?: any };

/** When a user is flagged "Heavy use". Visibility only: nothing is ever blocked. Overridable by env. */
export const HEAVY_USE = {
  /** Model spend over the last 30 days, USD. */
  cost30dUsd: Number(process.env.ADMIN_HEAVY_COST_30D ?? 5),
  /** Readings in any single UTC day of the last 30. */
  readingsPerDay: Number(process.env.ADMIN_HEAVY_DAILY_READINGS ?? 40),
};

const MODES: Mode[] = ["vedic", "western", "numerology"];
const KINDS: UsageKindName[] = ["reading", "deep_reading", "memory", "daily", "alert", "extraction", "other"];
const PAGE = 1000;
const MAX_ROWS = 200_000;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- reading helpers

const warned = new Set<string>();
function soft(table: string, error: unknown): void {
  const key = `${table}:${isMissingRelation(error) ? "missing" : "error"}`;
  if (warned.has(key)) return;
  warned.add(key);
  if (isMissingRelation(error)) console.warn(`admin: ${table} missing; that section reads as empty until its migration is applied`);
  else console.error(`admin: ${table} read error`, error);
}

/** For tests. */
export function resetAdminLogForTests(): void {
  warned.clear();
}

type Build = (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Every row of a query, a page at a time. Empty on any error. */
async function rows<T = Record<string, unknown>>(db: AdminDb, table: string, columns: string, build: Build = (q) => q): Promise<T[]> {
  const out: T[] = [];
  try {
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await build(db.from(table).select(columns)).range(from, from + PAGE - 1);
      if (error) {
        soft(table, error);
        return out;
      }
      const page = (data ?? []) as T[];
      out.push(...page);
      if (page.length < PAGE) break;
    }
  } catch (err) {
    soft(table, err);
  }
  return out;
}

/** Rows for one query, or null when it failed (so a caller can retry with fewer columns). */
async function tryRows<T>(db: AdminDb, table: string, columns: string, build: Build): Promise<T[] | null> {
  try {
    const { data, error } = await build(db.from(table).select(columns)).limit(5000);
    if (error) return null;
    return (data ?? []) as T[];
  } catch {
    return null;
  }
}

/** A row count. 0 on any error. */
async function count(db: AdminDb, table: string, build: Build = (q) => q): Promise<number> {
  try {
    const { count: n, error } = await build(db.from(table).select("*", { count: "exact", head: true }));
    if (error) {
      soft(table, error);
      return 0;
    }
    return n ?? 0;
  } catch (err) {
    soft(table, err);
    return 0;
  }
}

type AuthUser = { id: string; email?: string | null; created_at: string; last_sign_in_at?: string | null };

async function authUsers(db: AdminDb): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  try {
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) throw error;
      const users = (data?.users ?? []) as AuthUser[];
      out.push(...users);
      if (users.length < PAGE) break;
    }
  } catch (err) {
    soft("auth.users", err);
  }
  return out;
}

// ---------------------------------------------------------------- small utils

const money = (n: number) => Math.round(n * 1e6) / 1e6;
const ratio = (n: number) => Math.round(n * 1e4) / 1e4;
const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const utcDayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const iso = (v: unknown) => {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
};
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const asMode = (v: unknown): Mode => (MODES.includes(v as Mode) ? (v as Mode) : "vedic");

function daysBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  for (let t = utcDayStart(start).getTime(); t <= end.getTime(); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function fullName(p: { first_name?: unknown; last_name?: unknown } | undefined): string {
  if (!p) return "";
  return [str(p.first_name), str(p.last_name)].filter(Boolean).join(" ").trim();
}

type Conv = { id: string; user_id: string; tradition: string; title: string | null; created_at: string };
type Msg = { conversation_id: string; role: string; created_at: string; content?: string };
type Usage = { user_id: string | null; kind: string; model: string; cost_usd: number | string | null; created_at: string; conversation_id?: string | null };
type Profile = { user_id: string; first_name?: string; last_name?: string; place_name?: string };

/** Per-user spend and reading pattern over the last 30 days, and the "Heavy use" flag. */
function heavyUse(convUser: Map<string, string>, msgs30: Msg[], usage30: Usage[]) {
  const per = new Map<string, { cost30: number; readings30: number; byDay: Map<string, number> }>();
  const get = (id: string) => {
    let v = per.get(id);
    if (!v) per.set(id, (v = { cost30: 0, readings30: 0, byDay: new Map() }));
    return v;
  };
  for (const u of usage30) if (u.user_id) get(u.user_id).cost30 += Number(u.cost_usd ?? 0);
  for (const m of msgs30) {
    if (m.role !== "assistant") continue;
    const uid = convUser.get(m.conversation_id);
    if (!uid) continue;
    const v = get(uid);
    v.readings30++;
    const d = dayKey(m.created_at);
    v.byDay.set(d, (v.byDay.get(d) ?? 0) + 1);
  }
  const out = new Map<string, { cost30: number; readings30: number; heavy: boolean }>();
  for (const [id, v] of per) {
    const peak = Math.max(0, ...v.byDay.values());
    out.set(id, {
      cost30: money(v.cost30),
      readings30: v.readings30,
      heavy: v.cost30 >= HEAVY_USE.cost30dUsd || peak >= HEAVY_USE.readingsPerDay,
    });
  }
  return out;
}

// ---------------------------------------------------------------- overview

export async function adminOverview(db: AdminDb, daysIn = 30, now: Date = new Date()): Promise<Overview> {
  const days = Math.min(365, Math.max(1, Math.floor(Number.isFinite(daysIn) ? daysIn : 30)));
  const since = new Date(utcDayStart(now).getTime() - (days - 1) * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const today = utcDayStart(now);
  const fetchFrom = new Date(Math.min(since.getTime(), since30.getTime())).toISOString();

  const [users, profiles, convs, msgs, usage, readings, facts, memories, pOpen, pHappened, pDidnt, daily, alerts, push, life] =
    await Promise.all([
      authUsers(db),
      rows<Profile>(db, "birth_profiles", "user_id, first_name, last_name"),
      rows<Conv>(db, "conversations", "id, user_id, tradition"),
      rows<Msg>(db, "messages", "conversation_id, role, created_at", (q) => q.gte("created_at", fetchFrom)),
      rows<Usage>(db, "model_usage", "user_id, kind, model, cost_usd, created_at", (q) => q.gte("created_at", fetchFrom)),
      count(db, "messages", (q) => q.eq("role", "assistant")),
      count(db, "user_facts"),
      count(db, "conversation_memories"),
      count(db, "predictions", (q) => q.eq("status", "open")),
      count(db, "predictions", (q) => q.eq("status", "happened")),
      count(db, "predictions", (q) => q.eq("status", "didnt")),
      count(db, "daily_readings"),
      count(db, "alerts"),
      count(db, "device_tokens"),
      count(db, "life_events"),
    ]);

  const convUser = new Map(convs.map((c) => [c.id, c.user_id]));
  const convMode = new Map(convs.map((c) => [c.id, asMode(c.tradition)]));
  const inWindow = (at: string) => at >= since.toISOString();

  const dayList = daysBetween(since, now);
  const series = new Map(dayList.map((d) => [d, { day: d, signups: 0, readings: 0, costUsd: 0, active: new Set<string>() }]));

  for (const u of users) {
    const s = series.get(dayKey(u.created_at));
    if (s) s.signups++;
  }

  const modeCounts = new Map<Mode, number>(MODES.map((m) => [m, 0]));
  const active7 = new Set<string>();
  let readingsToday = 0;
  let readingsWindow = 0;
  for (const m of msgs) {
    const uid = convUser.get(m.conversation_id);
    const s = series.get(dayKey(m.created_at));
    if (m.role === "assistant") {
      if (m.created_at >= today.toISOString()) readingsToday++;
      if (inWindow(m.created_at)) {
        readingsWindow++;
        const mode = convMode.get(m.conversation_id) ?? "vedic";
        modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
        if (s) s.readings++;
      }
    } else if (uid) {
      if (m.created_at >= since7.toISOString()) active7.add(uid);
      if (s) s.active.add(uid);
    }
  }

  const models = new Map<string, { calls: number; cost: number }>();
  const kinds = new Map<string, { calls: number; cost: number }>(KINDS.map((k) => [k, { calls: 0, cost: 0 }]));
  let costWindow = 0;
  let costToday = 0;
  let readingRows = 0;
  let deepRows = 0;
  for (const u of usage) {
    if (!inWindow(u.created_at)) continue;
    const cost = Number(u.cost_usd ?? 0);
    costWindow += cost;
    if (u.created_at >= today.toISOString()) costToday += cost;
    const s = series.get(dayKey(u.created_at));
    if (s) s.costUsd += cost;
    if (u.kind === "reading") readingRows++;
    if (u.kind === "deep_reading") deepRows++;
    const k = kinds.get(KINDS.includes(u.kind as UsageKindName) ? u.kind : "other")!;
    k.calls++;
    k.cost += cost;
    const m = models.get(u.model) ?? { calls: 0, cost: 0 };
    m.calls++;
    m.cost += cost;
    models.set(u.model, m);
  }

  const heavy = heavyUse(
    convUser,
    msgs.filter((m) => m.created_at >= since30.toISOString()),
    usage.filter((u) => u.created_at >= since30.toISOString()),
  );
  const emails = new Map(users.map((u) => [u.id, u.email ?? ""]));
  const names = new Map(profiles.map((p) => [p.user_id, fullName(p)]));
  const topUsers = [...heavy.entries()]
    .filter(([, v]) => v.cost30 > 0 || v.readings30 > 0)
    .sort((a, b) => b[1].cost30 - a[1].cost30 || b[1].readings30 - a[1].readings30)
    .slice(0, 10)
    .map(([id, v]) => ({
      id,
      name: names.get(id) ?? "",
      email: emails.get(id) ?? "",
      costUsd30d: v.cost30,
      readings30d: v.readings30,
      heavy: v.heavy,
    }));

  return {
    generatedAt: now.toISOString(),
    days,
    totals: {
      users: users.length,
      newUsers: users.filter((u) => inWindow(u.created_at)).length,
      activeUsers7d: active7.size,
      readings,
      readingsToday,
      deepShare: readingRows + deepRows > 0 ? ratio(deepRows / (readingRows + deepRows)) : 0,
      costUsd: money(costWindow),
      costToday: money(costToday),
      costPerReading: readingsWindow > 0 ? money(costWindow / readingsWindow) : 0,
      facts,
      conversationMemories: memories,
      predictionsOpen: pOpen,
      predictionsHappened: pHappened,
      predictionsDidnt: pDidnt,
      predictionHitRate: pHappened + pDidnt > 0 ? ratio(pHappened / (pHappened + pDidnt)) : null,
      dailyReadings: daily,
      alertsSent: alerts,
      pushDevices: push,
      lifeEvents: life,
      heavyUsers: [...heavy.values()].filter((v) => v.heavy).length,
    },
    series: [...series.values()].map((s) => ({
      day: s.day,
      signups: s.signups,
      readings: s.readings,
      costUsd: money(s.costUsd),
      activeUsers: s.active.size,
    })),
    modes: MODES.map((mode) => ({ mode, readings: modeCounts.get(mode) ?? 0 })),
    models: [...models.entries()]
      .map(([model, v]) => ({ model, calls: v.calls, costUsd: money(v.cost) }))
      .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
    kinds: [...kinds.entries()]
      .map(([kind, v]) => ({ kind: kind as UsageKindName, calls: v.calls, costUsd: money(v.cost) }))
      .filter((k) => k.calls > 0),
    topUsers,
  };
}

// ---------------------------------------------------------------- users

export async function adminUsers(
  db: AdminDb,
  opts: { q?: string; limit?: number; offset?: number } = {},
  now: Date = new Date(),
): Promise<AdminUsers> {
  const limit = Math.min(200, Math.max(1, Math.floor(opts.limit ?? 50)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const since7 = new Date(now.getTime() - 7 * DAY_MS).toISOString();

  const [users, profiles, convs, msgs, usage30, facts, openPredictions, devices, admins] = await Promise.all([
    authUsers(db),
    rows<Profile>(db, "birth_profiles", "user_id, first_name, last_name, place_name"),
    rows<Conv>(db, "conversations", "id, user_id"),
    rows<Msg>(db, "messages", "conversation_id, role, created_at"),
    rows<Usage>(db, "model_usage", "user_id, kind, model, cost_usd, created_at", (q) => q.gte("created_at", since30)),
    rows<{ user_id: string }>(db, "user_facts", "user_id"),
    rows<{ user_id: string }>(db, "predictions", "user_id", (q) => q.eq("status", "open")),
    rows<{ user_id: string }>(db, "device_tokens", "user_id"),
    rows<{ user_id: string }>(db, "admins", "user_id"),
  ]);

  const convUser = new Map(convs.map((c) => [c.id, c.user_id]));
  const profile = new Map(profiles.map((p) => [p.user_id, p]));
  const tally = (list: { user_id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of list) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
    return m;
  };
  const factCount = tally(facts);
  const openCount = tally(openPredictions);
  const pushSet = new Set(devices.map((d) => d.user_id));
  const adminSet = new Set(admins.map((a) => a.user_id));

  const readings = new Map<string, { all: number; week: number; last: string | null }>();
  for (const m of msgs) {
    const uid = convUser.get(m.conversation_id);
    if (!uid) continue;
    const r = readings.get(uid) ?? { all: 0, week: 0, last: null };
    r.last = later(r.last, iso(m.created_at));
    if (m.role === "assistant") {
      r.all++;
      if (m.created_at >= since7) r.week++;
    }
    readings.set(uid, r);
  }
  const heavy = heavyUse(convUser, msgs.filter((m) => m.created_at >= since30), usage30);

  const q = (opts.q ?? "").trim().toLowerCase();
  const all = users
    .map((u) => {
      const p = profile.get(u.id);
      const r = readings.get(u.id);
      const h = heavy.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        name: fullName(p),
        place: str(p?.place_name),
        createdAt: iso(u.created_at),
        lastActiveAt: later(r?.last ?? null, u.last_sign_in_at ? iso(u.last_sign_in_at) : null),
        plan: "free" as Plan,
        readings: r?.all ?? 0,
        readings7d: r?.week ?? 0,
        costUsd30d: h?.cost30 ?? 0,
        facts: factCount.get(u.id) ?? 0,
        predictionsOpen: openCount.get(u.id) ?? 0,
        hasPush: pushSet.has(u.id),
        isAdmin: adminSet.has(u.id),
        heavy: h?.heavy ?? false,
      } satisfies AdminUserRow;
    })
    .filter((u) => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    .sort((a, b) => (b.lastActiveAt ?? b.createdAt).localeCompare(a.lastActiveAt ?? a.createdAt));

  const page = all.slice(offset, offset + limit);
  await Promise.all(
    page.map(async (u) => {
      try {
        u.plan = await getPlan(db as never, u.id);
      } catch {
        u.plan = "free";
      }
    }),
  );
  return { users: page, total: all.length };
}

// ---------------------------------------------------------------- one user

/** The birth-time-known flag, whatever the unknown-birth-time migration calls it. True when absent. */
function timeKnown(b: Record<string, unknown>): boolean {
  if (typeof b.birth_time_known === "boolean") return b.birth_time_known;
  if (typeof b.time_known === "boolean") return b.time_known;
  if (typeof b.birth_time_unknown === "boolean") return !b.birth_time_unknown;
  if (typeof b.time_unknown === "boolean") return !b.time_unknown;
  return true;
}

function chartSummary(chart: unknown): AdminUserDetail["user"]["chart"] {
  const vedic = (chart as { vedic?: Record<string, unknown> } | null)?.vedic;
  if (!vedic) return null;
  const asc = vedic.ascendant as { sign?: string } | undefined;
  const dasha = vedic.dasha as Record<string, string> | undefined;
  return {
    lagna: str(asc?.sign),
    moonSign: str(vedic.moonSign),
    sunSign: str(vedic.sunSign),
    mahadasha: str(dasha?.mahadasha),
    antardasha: str(dasha?.antardasha),
    antardashaEnd: str(dasha?.antardashaEnd),
  };
}

/** A message as one plain line for a timeline card. */
function snippet(text: unknown, max = 160): string {
  const plain = str(text)
    .replace(/[#*_`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

const TIMELINE_CAP = 200;

export async function adminUserDetail(db: AdminDb, id: string, now: Date = new Date()): Promise<AdminUserDetail | null> {
  let authUser: AuthUser | null = null;
  try {
    const { data } = await db.auth.admin.getUserById(id);
    authUser = (data?.user as AuthUser | undefined) ?? null;
  } catch (err) {
    soft("auth.users", err);
  }

  const one = async (table: string) => {
    try {
      const { data, error } = await db.from(table).select("*").eq("user_id", id).maybeSingle();
      if (error) soft(table, error);
      return (data as Record<string, unknown> | null) ?? null;
    } catch (err) {
      soft(table, err);
      return null;
    }
  };

  const [birth, convs, usage, summaries, predictions, life, alerts, daily, pushDevices, adminRow] = await Promise.all([
    one("birth_profiles"),
    rows<Conv>(db, "conversations", "id, user_id, tradition, title, created_at", (q) => q.eq("user_id", id)),
    rows<Usage>(db, "model_usage", "kind, model, cost_usd, created_at, conversation_id", (q) => q.eq("user_id", id)),
    rows<Record<string, unknown>>(db, "conversation_memories", "conversation_id, summary, topics, last_message_at", (q) =>
      q.eq("user_id", id),
    ),
    rows<Record<string, unknown>>(
      db,
      "predictions",
      "id, topic, claim, window_start, window_end, confidence, status, checked_at, created_at",
      (q) => q.eq("user_id", id),
    ),
    rows<Record<string, unknown>>(db, "life_events", "id, title, occurred_on, created_at", (q) => q.eq("user_id", id)),
    rows<Record<string, unknown>>(db, "alerts", "id, title, body, created_at", (q) => q.eq("user_id", id)),
    rows<Record<string, unknown>>(db, "daily_readings", "id, title, body, slot, created_at", (q) => q.eq("user_id", id)),
    count(db, "device_tokens", (q) => q.eq("user_id", id)),
    one("admins"),
  ]);

  if (!authUser && !birth) return null;

  // Facts: the 0009 columns when present, else the 0008 shape with their defaults.
  let factRows =
    (await tryRows<Record<string, unknown>>(db, "user_facts", "id, fact, category, confidence, source, updated_at", (q) =>
      q.eq("user_id", id),
    )) ?? null;
  if (factRows === null) {
    factRows = await rows<Record<string, unknown>>(db, "user_facts", "id, fact, category, created_at, updated_at", (q) =>
      q.eq("user_id", id),
    );
  }

  const convIds = convs.map((c) => c.id);
  const msgs: Msg[] = [];
  for (let i = 0; i < convIds.length; i += 100) {
    const chunk = convIds.slice(i, i + 100);
    msgs.push(
      ...(await rows<Msg>(db, "messages", "conversation_id, role, content, created_at", (q) => q.in("conversation_id", chunk))),
    );
  }

  const convById = new Map(convs.map((c) => [c.id, c]));
  const assistant = msgs.filter((m) => m.role === "assistant");
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const lastMessage = msgs.reduce<string | null>((acc, m) => later(acc, iso(m.created_at)), null);

  // Deep readings are told apart from standard ones by their usage row: same
  // conversation, written within a few minutes of the message.
  const deepRows = usage.filter((u) => u.kind === "deep_reading");
  const usedDeep = new Set<number>();
  const isDeep = (m: Msg) => {
    const t = new Date(m.created_at).getTime();
    const i = deepRows.findIndex(
      (u, idx) => !usedDeep.has(idx) && u.conversation_id === m.conversation_id && Math.abs(new Date(u.created_at).getTime() - t) < 10 * 60_000,
    );
    if (i === -1) return false;
    usedDeep.add(i);
    return true;
  };

  const timeline: TimelineEvent[] = [];
  if (authUser) timeline.push({ at: iso(authUser.created_at), kind: "signup", title: "Signed up", detail: authUser.email ?? "", refId: null });
  for (const m of assistant) {
    const c = convById.get(m.conversation_id);
    const deep = isDeep(m);
    timeline.push({
      at: iso(m.created_at),
      kind: deep ? "deep_reading" : "reading",
      title: str(c?.title) || (deep ? "Deep reading" : "Reading"),
      detail: snippet(m.content),
      refId: m.conversation_id,
    });
  }
  for (const d of daily)
    timeline.push({ at: iso(d.created_at), kind: "daily", title: str(d.title) || "Daily reading", detail: snippet(d.body), refId: str(d.id) || null });
  for (const a of alerts)
    timeline.push({ at: iso(a.created_at), kind: "alert", title: str(a.title) || "Alert", detail: snippet(a.body), refId: str(a.id) || null });
  for (const e of life)
    timeline.push({
      at: iso(e.created_at),
      kind: "life_event",
      title: str(e.title) || "Life event",
      detail: e.occurred_on ? `Happened ${str(e.occurred_on)}` : "",
      refId: str(e.id) || null,
    });
  for (const p of predictions) {
    timeline.push({ at: iso(p.created_at), kind: "prediction", title: str(p.topic) || "Prediction", detail: snippet(p.claim), refId: str(p.id) || null });
    if (p.checked_at && (p.status === "happened" || p.status === "didnt" || p.status === "unsure"))
      timeline.push({
        at: iso(p.checked_at),
        kind: "prediction_resolved",
        title: p.status === "happened" ? "Prediction happened" : p.status === "didnt" ? "Prediction didn't happen" : "Prediction unsure",
        detail: snippet(p.claim),
        refId: str(p.id) || null,
      });
  }
  for (const f of factRows)
    timeline.push({
      at: iso(f.created_at ?? f.updated_at),
      kind: "fact",
      title: `Learned: ${str(f.category) || "fact"}`,
      detail: snippet(f.fact),
      refId: str(f.id) || null,
    });
  timeline.sort((a, b) => b.at.localeCompare(a.at));

  const usageDays = daysBetween(new Date(now.getTime() - 29 * DAY_MS), now);
  const perDay = new Map(usageDays.map((d) => [d, { day: d, readings: 0, costUsd: 0 }]));
  for (const m of assistant) {
    const d = perDay.get(dayKey(m.created_at));
    if (d) d.readings++;
  }
  let costAll = 0;
  let cost30 = 0;
  for (const u of usage) {
    const cost = Number(u.cost_usd ?? 0);
    costAll += cost;
    if (u.created_at >= since30) cost30 += cost;
    const d = perDay.get(dayKey(u.created_at));
    if (d) d.costUsd += cost;
  }

  const msgsByConv = new Map<string, { n: number; last: string | null }>();
  for (const m of msgs) {
    const v = msgsByConv.get(m.conversation_id) ?? { n: 0, last: null };
    v.n++;
    v.last = later(v.last, iso(m.created_at));
    msgsByConv.set(m.conversation_id, v);
  }

  // Heavy use, on the same rule as the users list.
  const byDay = new Map<string, number>();
  for (const m of assistant) if (m.created_at >= since30) byDay.set(dayKey(m.created_at), (byDay.get(dayKey(m.created_at)) ?? 0) + 1);
  const heavy = cost30 >= HEAVY_USE.cost30dUsd || Math.max(0, ...byDay.values()) >= HEAVY_USE.readingsPerDay;

  let plan: Plan = "free";
  try {
    plan = await getPlan(db as never, id);
  } catch {
    plan = "free";
  }

  const b = birth ?? {};
  const status = (s: string) => predictions.filter((p) => p.status === s).length;

  return {
    user: {
      id,
      email: authUser?.email ?? "",
      name: fullName(b as Profile),
      createdAt: iso(authUser?.created_at ?? b.updated_at),
      lastActiveAt: later(lastMessage, authUser?.last_sign_in_at ? iso(authUser.last_sign_in_at) : null),
      plan,
      isAdmin: !!adminRow,
      heavy,
      birth: birth
        ? {
            date: str(b.birth_date),
            time: str(b.birth_time),
            timeKnown: timeKnown(b),
            place: str(b.place_name),
            timezone: str(b.timezone),
          }
        : null,
      chart: chartSummary(b.chart),
    },
    stats: {
      readings: assistant.length,
      deepReadings: deepRows.length,
      costUsd: money(costAll),
      costUsd30d: money(cost30),
      facts: factRows.length,
      summaries: summaries.length,
      predictionsOpen: status("open"),
      predictionsHappened: status("happened"),
      predictionsDidnt: status("didnt"),
      lifeEvents: life.length,
      alerts: alerts.length,
      dailyReadings: daily.length,
      pushDevices,
    },
    timeline: timeline.slice(0, TIMELINE_CAP),
    conversations: convs
      .map((c) => ({
        id: c.id,
        title: str(c.title) || "Reading",
        mode: asMode(c.tradition),
        createdAt: iso(c.created_at),
        lastMessageAt: msgsByConv.get(c.id)?.last ?? null,
        messages: msgsByConv.get(c.id)?.n ?? 0,
      }))
      .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt)),
    memory: {
      facts: factRows
        .map((f) => ({
          id: str(f.id),
          fact: str(f.fact),
          category: str(f.category),
          confidence: str(f.confidence) || "stated",
          source: str(f.source) || "chat",
          updatedAt: iso(f.updated_at ?? f.created_at),
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      summaries: summaries
        .map((s) => ({
          conversationId: str(s.conversation_id),
          summary: str(s.summary),
          topics: Array.isArray(s.topics) ? s.topics.map(str) : [],
          lastMessageAt: iso(s.last_message_at),
        }))
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
      predictions: predictions
        .map((p) => ({
          id: str(p.id),
          topic: str(p.topic),
          claim: str(p.claim),
          windowStart: str(p.window_start),
          windowEnd: str(p.window_end),
          confidence: str(p.confidence),
          status: str(p.status) || "open",
          checkedAt: p.checked_at ? iso(p.checked_at) : null,
        }))
        .sort((a, b) => b.windowStart.localeCompare(a.windowStart)),
    },
    usage: [...perDay.values()].map((d) => ({ ...d, costUsd: money(d.costUsd) })),
  };
}

// ---------------------------------------------------------------- one conversation

export async function adminConversation(db: AdminDb, id: string): Promise<AdminConversation | null> {
  try {
    const { data: conv, error } = await db
      .from("conversations")
      .select("id, user_id, tradition, title, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) soft("conversations", error);
    if (!conv) return null;
    const messages = await rows<Msg>(db, "messages", "role, content, created_at, conversation_id", (q) =>
      q.eq("conversation_id", id).order("created_at", { ascending: true }),
    );
    return {
      conversation: {
        id: str(conv.id),
        userId: str(conv.user_id),
        title: str(conv.title) || "Reading",
        mode: asMode(conv.tradition),
        createdAt: iso(conv.created_at),
      },
      messages: messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: str(m.content),
        createdAt: iso(m.created_at),
      })),
    };
  } catch (err) {
    soft("conversations", err);
    return null;
  }
}
