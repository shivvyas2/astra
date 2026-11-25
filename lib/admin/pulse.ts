import "server-only";
import { en } from "@/lib/i18n/en";
import { gu } from "@/lib/i18n/gu";
import { hi } from "@/lib/i18n/hi";
import { isMissingRelation } from "@/lib/usage/record";
import { authUsers, dayKey, DAY_MS, fullName, iso, later, rows, utcDayStart, type AdminDb, type AuthUser, type Conv, type Msg, type Profile } from "./stats";
import { STAGES, type Flagged, type Pulse, type Stage } from "./types";

/**
 * How Astrya is doing: who comes, where people stop, what went unanswered, and
 * who is using it for something it is not for. Admins are left out throughout,
 * so the owner's own testing never moves a number.
 *
 * Like the rest of the admin, a missing table reads as empty. Nothing here
 * reads what anyone wrote, only who, when and how often; messages are matched
 * against the apps' own opening line, and that is all.
 */

/** Turned-away messages in a week that make a spam flag. */
export const FLAG_AFTER = { off_topic: 5, instructions: 3, abuse: 1 } as const;
/** Questions inside a few minutes that no one types by hand. */
export const BURST = { questions: 12, minutes: 5 } as const;
/** Still being answered, not unanswered. */
const GRACE_MS = 3 * 60_000;
const UNANSWERED_SHOWN = 8;

/** What the apps ask by themselves on a first visit, which is not someone asking. */
const OPENINGS = [...new Set([en.chat.welcome, hi.chat.welcome, gu.chat.welcome, "Welcome me with a short reading for today based on my chart. Two or three short sections."])];

type Seen = { user_id: string; last_seen_at: string };
type Flag = { user_id: string; kind: string; created_at: string };

/** Where one person is on the way in. */
export function stageOf(u: AuthUser, has: { profile: boolean; consent: boolean; days: number }): Stage {
  // Asking a question needed everything before it, however consent was recorded then.
  if (has.days >= 2) return "returned";
  if (has.days === 1) return "asked";
  if (has.consent && has.profile) return "consented";
  if (has.profile) return "profile";
  if (u.last_sign_in_at || u.email_confirmed_at || u.phone_confirmed_at) return "signed_in";
  return "signed_up";
}

export type People = { users: AuthUser[]; stage: Map<string, Stage>; lastSeen: Map<string, string>; asked: Map<string, Set<string>> };

/** Everyone but admins, with how far each got and when they were last here. */
export async function loadPeople(db: AdminDb): Promise<People & { convUser: Map<string, string>; msgs: Msg[]; profiles: Profile[] }> {
  const [all, admins, profiles, consents, convs, msgs, seen, openings] = await Promise.all([
    authUsers(db),
    rows<{ user_id: string }>(db, "admins", "user_id"),
    rows<Profile>(db, "birth_profiles", "user_id, first_name, last_name"),
    rows<{ user_id: string }>(db, "ai_consents", "user_id"),
    rows<Conv>(db, "conversations", "id, user_id"),
    rows<Msg>(db, "messages", "conversation_id, role, created_at"),
    rows<Seen>(db, "user_activity", "user_id, last_seen_at"),
    rows<Msg>(db, "messages", "conversation_id, created_at", (q) => q.eq("role", "user").in("content", OPENINGS)),
  ]);
  const opened = new Set(openings.map((m) => `${m.conversation_id} ${m.created_at}`));
  const adminSet = new Set(admins.map((a) => a.user_id));
  const users = all.filter((u) => !adminSet.has(u.id));
  const convUser = new Map(convs.map((c) => [c.id, c.user_id]));
  const asked = new Map<string, Set<string>>();
  const lastSeen = new Map<string, string>();
  const see = (id: string, at: string | null | undefined) => {
    const t = at ? iso(at) : "";
    if (t) lastSeen.set(id, later(lastSeen.get(id) ?? null, t)!);
  };
  for (const u of users) see(u.id, u.last_sign_in_at);
  for (const s of seen) see(s.user_id, s.last_seen_at);
  for (const m of msgs) {
    const id = m.role === "user" ? convUser.get(m.conversation_id) : undefined;
    if (!id) continue;
    see(id, m.created_at);
    if (opened.has(`${m.conversation_id} ${m.created_at}`)) continue;
    const days = asked.get(id) ?? new Set<string>();
    days.add(dayKey(m.created_at));
    asked.set(id, days);
  }
  const hasProfile = new Set(profiles.map((p) => p.user_id));
  const hasConsent = new Set(consents.map((c) => c.user_id));
  const stage = new Map(users.map((u) => [u.id, stageOf(u, { profile: hasProfile.has(u.id), consent: hasConsent.has(u.id), days: asked.get(u.id)?.size ?? 0 })]));
  return { users, stage, lastSeen, asked, convUser, msgs, profiles };
}

export async function adminPulse(db: AdminDb, daysIn = 30, now: Date = new Date()): Promise<Pulse> {
  const days = Math.min(365, Math.max(1, Math.floor(daysIn)));
  const today = utcDayStart(now);
  const since = new Date(today.getTime() - (days - 1) * DAY_MS);
  const week = new Date(now.getTime() - 7 * DAY_MS).toISOString();

  const [people, daily, flags, seenTable] = await Promise.all([
    loadPeople(db),
    rows<{ day: string; users: number }>(db, "daily_active", "day, users"),
    rows<Flag>(db, "chat_flags", "user_id, kind, created_at", (q) => q.gte("created_at", week)),
    tableExists(db, "daily_active"),
  ]);
  const { users, stage, lastSeen, asked, convUser, msgs } = people;
  const ids = new Set(users.map((u) => u.id));

  // ---- who comes
  const activeSince = (from: number) => users.filter((u) => Date.parse(lastSeen.get(u.id) ?? "") >= from).length;
  const todayActive = activeSince(today.getTime());
  const active7 = activeSince(now.getTime() - 7 * DAY_MS);
  const active30 = activeSince(now.getTime() - 30 * DAY_MS);
  const counted = new Map(daily.map((d) => [String(d.day).slice(0, 10), Number(d.users)]));
  const askedOn = new Map<string, number>();
  for (const [id, set] of asked) if (ids.has(id)) for (const d of set) askedOn.set(d, (askedOn.get(d) ?? 0) + 1);
  const series: Pulse["series"] = [];
  let total = users.filter((u) => u.created_at < since.toISOString()).length;
  for (let t = since.getTime(); t <= today.getTime(); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    const joined = users.filter((u) => dayKey(u.created_at) === day).length;
    total += joined;
    // A day is at least the people who asked something; today also has its live count.
    const active = Math.max(counted.get(day) ?? 0, askedOn.get(day) ?? 0, t === today.getTime() ? todayActive : 0);
    series.push({ day, total, joined, active });
  }

  // ---- where people stop
  const order = new Map(STAGES.map((s, i) => [s, i]));
  const reached = STAGES.map((s) => users.filter((u) => order.get(stage.get(u.id)!)! >= order.get(s)!).length);
  const funnel = STAGES.map((s, i) => ({ stage: s, reached: reached[i], lost: i === 0 ? 0 : reached[i - 1] - reached[i] }));
  const worst = funnel.slice(1).reduce((a, b) => (b.lost > a.lost ? b : a), funnel[1]);

  // ---- what went unanswered
  const byConv = new Map<string, Msg[]>();
  for (const m of msgs) {
    const uid = convUser.get(m.conversation_id);
    if (!uid || !ids.has(uid)) continue;
    const list = byConv.get(m.conversation_id) ?? [];
    list.push(m);
    byConv.set(m.conversation_id, list);
  }
  const unanswered: { conversationId: string; userId: string; at: string }[] = [];
  let questions = 0;
  for (const [conversationId, list] of byConv) {
    list.sort((a, b) => iso(a.created_at).localeCompare(iso(b.created_at)));
    list.forEach((m, i) => {
      if (m.role !== "user" || iso(m.created_at) < since.toISOString()) return;
      questions++;
      if (list[i + 1]?.role === "assistant" || now.getTime() - Date.parse(m.created_at) <= GRACE_MS) return;
      unanswered.push({ conversationId, userId: convUser.get(conversationId)!, at: iso(m.created_at) });
    });
  }
  unanswered.sort((a, b) => b.at.localeCompare(a.at));

  // ---- who to look at
  const names = new Map(people.profiles.map((p) => [p.user_id, fullName(p)]));
  const emails = new Map(users.map((u) => [u.id, u.email ?? ""]));
  const tally = new Map<string, Record<string, number>>();
  for (const f of flags) {
    if (!ids.has(f.user_id) || f.created_at < week) continue;
    const t = tally.get(f.user_id) ?? {};
    t[f.kind] = (t[f.kind] ?? 0) + 1;
    tally.set(f.user_id, t);
  }
  const bursts = burstsOf(msgs, convUser, week);
  const flagged: Flagged[] = [];
  for (const id of new Set([...tally.keys(), ...bursts.keys()])) {
    if (!ids.has(id)) continue;
    const t = tally.get(id) ?? {};
    const reasons: string[] = [];
    if ((t.abuse ?? 0) >= FLAG_AFTER.abuse) reasons.push(`${t.abuse} abusive`);
    if ((t.instructions ?? 0) >= FLAG_AFTER.instructions) reasons.push(`${t.instructions} tried to change its rules`);
    if ((t.off_topic ?? 0) >= FLAG_AFTER.off_topic) reasons.push(`${t.off_topic} off topic`);
    if (bursts.has(id)) reasons.push(`${bursts.get(id)} questions in ${BURST.minutes} minutes`);
    if (reasons.length) flagged.push({ id, name: names.get(id) ?? "", email: emails.get(id) ?? "", reasons });
  }

  return {
    days,
    counting: seenTable,
    totals: {
      users: users.length,
      joinedToday: users.filter((u) => dayKey(u.created_at) === dayKey(now.toISOString())).length,
      joined7: users.filter((u) => u.created_at >= week).length,
      activeToday: todayActive,
      active7,
      active30,
    },
    series,
    funnel,
    worst: worst.lost > 0 ? worst.stage : null,
    failures: {
      questions,
      unanswered: unanswered.length,
      people: new Set(unanswered.map((u) => u.userId)).size,
      recent: unanswered.slice(0, UNANSWERED_SHOWN).map((u) => ({ ...u, name: names.get(u.userId) || emails.get(u.userId) || "Unnamed" })),
      neverConfirmed: users.filter((u) => stage.get(u.id) === "signed_up").length,
    },
    flags: {
      offTopic7: flags.filter((f) => ids.has(f.user_id) && f.kind === "off_topic").length,
      instructions7: flags.filter((f) => ids.has(f.user_id) && f.kind === "instructions").length,
      abuse7: flags.filter((f) => ids.has(f.user_id) && f.kind === "abuse").length,
      users: flagged.sort((a, b) => b.reasons.length - a.reasons.length),
    },
  };
}

/** The most questions each person sent inside one burst window since `from`, where that is a burst. */
export function burstsOf(msgs: Msg[], convUser: Map<string, string>, from: string): Map<string, number> {
  const times = new Map<string, number[]>();
  for (const m of msgs) {
    const id = m.role === "user" && m.created_at >= from ? convUser.get(m.conversation_id) : undefined;
    if (id) times.set(id, [...(times.get(id) ?? []), Date.parse(m.created_at)]);
  }
  const out = new Map<string, number>();
  for (const [id, list] of times) {
    list.sort((a, b) => a - b);
    let most = 0;
    for (let i = 0, j = 0; j < list.length; j++) {
      while (list[j] - list[i] > BURST.minutes * 60_000) i++;
      most = Math.max(most, j - i + 1);
    }
    if (most >= BURST.questions) out.set(id, most);
  }
  return out;
}

async function tableExists(db: AdminDb, table: string): Promise<boolean> {
  try {
    // A real read: a head request says nothing about why it failed.
    const { error } = await db.from(table).select("*").limit(1);
    return !error || !isMissingRelation(error);
  } catch {
    return false;
  }
}
