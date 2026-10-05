import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { memoryDb } from "./testDb";
import { adminConversation, adminOverview, adminUserDetail, adminUsers, HEAVY_USE, resetAdminLogForTests } from "./stats";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const ago = (days: number, hour = 10) => new Date(Date.UTC(2026, 9, 5 - days, hour)).toISOString();

const users = [
  { id: "u1", email: "asha@example.com", created_at: ago(40), last_sign_in_at: ago(0, 9) },
  { id: "u2", email: "ravi@example.com", created_at: ago(2), last_sign_in_at: null },
  { id: "u3", email: "admin@example.com", created_at: ago(1), last_sign_in_at: null },
];

function fullTables() {
  const messages: Record<string, unknown>[] = [];
  // u1: conversation c1 (vedic), three readings today and one 3 days ago.
  for (const [i, at] of [ago(0, 8), ago(0, 9), ago(0, 10), ago(3)].entries()) {
    messages.push({ conversation_id: "c1", role: "user", content: `question ${i}`, created_at: at });
    messages.push({ conversation_id: "c1", role: "assistant", content: `**Answer** ${i}`, created_at: at.replace(":00:00.000Z", ":00:30.000Z") });
  }
  // u2: numerology conversation, one reading 1 day ago.
  messages.push({ conversation_id: "c2", role: "user", content: "hi", created_at: ago(1) });
  messages.push({ conversation_id: "c2", role: "assistant", content: "Mulank 5", created_at: ago(1, 11) });
  return {
    birth_profiles: [
      {
        user_id: "u1",
        first_name: "Asha",
        last_name: "Rao",
        place_name: "Pune",
        birth_date: "1995-03-14",
        birth_time: "06:30:00",
        timezone: "Asia/Kolkata",
        chart: {
          vedic: {
            ascendant: { sign: "Leo" },
            moonSign: "Cancer",
            sunSign: "Pisces",
            dasha: { mahadasha: "Saturn", antardasha: "Mercury", antardashaEnd: "2027-01-01" },
          },
        },
      },
      { user_id: "u2", first_name: "Ravi", last_name: "", place_name: "Delhi" },
    ],
    conversations: [
      { id: "c1", user_id: "u1", tradition: "vedic", title: "Career this year", created_at: ago(3) },
      { id: "c2", user_id: "u2", tradition: "numerology", title: null, created_at: ago(1) },
    ],
    messages,
    model_usage: [
      { user_id: "u1", kind: "reading", model: "claude-sonnet-5-5", cost_usd: 0.01, created_at: ago(0, 8), conversation_id: "c1" },
      { user_id: "u1", kind: "deep_reading", model: "claude-opus-5-5", cost_usd: "0.05", created_at: ago(0, 9).replace(":00:00.000Z", ":01:00.000Z"), conversation_id: "c1" },
      { user_id: "u1", kind: "memory", model: "claude-haiku-4-5", cost_usd: 0.002, created_at: ago(0, 9) },
      { user_id: "u2", kind: "reading", model: "claude-sonnet-5-5", cost_usd: 0.008, created_at: ago(1, 11), conversation_id: "c2" },
      { user_id: null, kind: "daily", model: "claude-sonnet-5-5", cost_usd: 0.004, created_at: ago(40) },
    ],
    user_facts: [
      { id: "f1", user_id: "u1", fact: "Works as a nurse in Pune", category: "work", confidence: "stated", source: "chat", created_at: ago(3), updated_at: ago(3) },
    ],
    conversation_memories: [{ conversation_id: "c1", user_id: "u1", summary: "Asked about career.", topics: ["work"], last_message_at: ago(0) }],
    predictions: [
      { id: "p1", user_id: "u1", topic: "work", claim: "A job offer by March", window_start: "2026-11-01", window_end: "2027-03-31", confidence: "likely", status: "open", checked_at: null, created_at: ago(3) },
      { id: "p2", user_id: "u1", topic: "money", claim: "A raise this autumn", window_start: "2026-09-01", window_end: "2026-10-01", confidence: "possible", status: "happened", checked_at: ago(1), created_at: ago(30) },
      { id: "p3", user_id: "u2", topic: "home", claim: "A move this summer", window_start: "2026-06-01", window_end: "2026-08-31", confidence: "possible", status: "didnt", checked_at: ago(2), created_at: ago(30) },
    ],
    daily_readings: [{ id: "d1", user_id: "u1", title: "Steady day", body: "Work goes well.", slot: "morning", created_at: ago(0, 7) }],
    alerts: [{ id: "a1", user_id: "u1", title: "Sade Sati eases", body: "Saturn moves on.", created_at: ago(5) }],
    device_tokens: [{ token: "t1", user_id: "u1" }],
    life_events: [{ id: "l1", user_id: "u1", title: "Got married", occurred_on: "2021-02-01", created_at: ago(10) }],
    admins: [{ user_id: "u3" }],
  };
}

const ALL_TABLES = [
  "birth_profiles",
  "conversations",
  "messages",
  "model_usage",
  "user_facts",
  "conversation_memories",
  "predictions",
  "daily_readings",
  "alerts",
  "device_tokens",
  "life_events",
  "admins",
];

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  resetAdminLogForTests();
  spies = [vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("adminOverview", () => {
  it("totals, series and breakdowns from every table", async () => {
    const o = await adminOverview(memoryDb({ tables: fullTables(), users }), 30, NOW);
    expect(o.days).toBe(30);
    expect(o.totals).toMatchObject({
      users: 3,
      newUsers: 2,
      activeUsers7d: 2,
      readings: 5,
      readingsToday: 3,
      facts: 1,
      conversationMemories: 1,
      predictionsOpen: 1,
      predictionsHappened: 1,
      predictionsDidnt: 1,
      predictionHitRate: 0.5,
      dailyReadings: 1,
      alertsSent: 1,
      pushDevices: 1,
      lifeEvents: 1,
      heavyUsers: 0,
    });
    // In the window: 0.01 + 0.05 + 0.002 + 0.008 (the daily row is 40 days old).
    expect(o.totals.costUsd).toBeCloseTo(0.07, 6);
    expect(o.totals.costToday).toBeCloseTo(0.062, 6);
    expect(o.totals.costPerReading).toBeCloseTo(0.07 / 5, 6);
    expect(o.totals.deepShare).toBeCloseTo(1 / 3, 3);
    expect(o.series).toHaveLength(30);
    expect(o.series.at(-1)).toMatchObject({ day: "2026-10-05", readings: 3, activeUsers: 1 });
    expect(o.series.reduce((s, d) => s + d.signups, 0)).toBe(2);
    expect(o.modes).toEqual([
      { mode: "vedic", readings: 4 },
      { mode: "western", readings: 0 },
      { mode: "numerology", readings: 1 },
    ]);
    expect(o.models[0]).toEqual({ model: "claude-opus-5-5", calls: 1, costUsd: 0.05 });
    expect(o.kinds.map((k) => k.kind).sort()).toEqual(["deep_reading", "memory", "reading"]);
    expect(o.topUsers[0]).toEqual({ id: "u1", name: "Asha Rao", email: "asha@example.com", costUsd30d: 0.062, readings30d: 4, heavy: false });
    expect(typeof o.generatedAt).toBe("string");
  });

  it("flags heavy use by cost and by a burst of readings in one day", async () => {
    const t = fullTables();
    t.model_usage.push({ user_id: "u2", kind: "reading", model: "claude-opus-5-5", cost_usd: HEAVY_USE.cost30dUsd, created_at: ago(2), conversation_id: "c2" });
    for (let i = 0; i < HEAVY_USE.readingsPerDay; i++)
      t.messages.push({ conversation_id: "c1", role: "assistant", content: "x", created_at: ago(4, 0).replace("00:00.000Z", `${String(i % 60).padStart(2, "0")}:00.000Z`) });
    const o = await adminOverview(memoryDb({ tables: t, users }), 30, NOW);
    expect(o.totals.heavyUsers).toBe(2);
  });

  it("degrades every section to zeros with no tables and no auth, never throwing", async () => {
    const o = await adminOverview(memoryDb({ missing: ALL_TABLES, authFails: true }), 7, NOW);
    expect(o.totals).toEqual({
      users: 0,
      newUsers: 0,
      activeUsers7d: 0,
      readings: 0,
      readingsToday: 0,
      deepShare: 0,
      costUsd: 0,
      costToday: 0,
      costPerReading: 0,
      facts: 0,
      conversationMemories: 0,
      predictionsOpen: 0,
      predictionsHappened: 0,
      predictionsDidnt: 0,
      predictionHitRate: null,
      dailyReadings: 0,
      alertsSent: 0,
      pushDevices: 0,
      lifeEvents: 0,
      heavyUsers: 0,
    });
    expect(o.series).toHaveLength(7);
    expect(o.modes.every((m) => m.readings === 0)).toBe(true);
    expect(o.models).toEqual([]);
    expect(o.kinds).toEqual([]);
    expect(o.topUsers).toEqual([]);
  });

  it("still counts readings and cost per reading when only model_usage is missing", async () => {
    const o = await adminOverview(memoryDb({ tables: fullTables(), users, missing: ["model_usage"] }), 30, NOW);
    expect(o.totals.readings).toBe(5);
    expect(o.totals.costUsd).toBe(0);
    expect(o.totals.costPerReading).toBe(0);
    expect(o.topUsers.map((u) => u.id)).toEqual(["u1", "u2"]);
  });

  it("clamps days to 1..365", async () => {
    expect((await adminOverview(memoryDb({}), 0, NOW)).days).toBe(1);
    expect((await adminOverview(memoryDb({}), 9999, NOW)).series).toHaveLength(365);
  });
});

describe("adminUsers", () => {
  it("lists users newest-active first with per-user numbers", async () => {
    const { users: list, total } = await adminUsers(memoryDb({ tables: fullTables(), users }), {}, NOW);
    expect(total).toBe(3);
    expect(list.map((u) => u.id)).toEqual(["u1", "u2", "u3"]);
    expect(list[0]).toEqual({
      id: "u1",
      email: "asha@example.com",
      name: "Asha Rao",
      place: "Pune",
      createdAt: ago(40),
      lastActiveAt: ago(0, 10).replace(":00:00.000Z", ":00:30.000Z"),
      plan: "free",
      readings: 4,
      readings7d: 4,
      costUsd30d: 0.062,
      facts: 1,
      predictionsOpen: 1,
      hasPush: true,
      isAdmin: false,
      heavy: false,
    });
    expect(list[2]).toMatchObject({ id: "u3", isAdmin: true, lastActiveAt: null, readings: 0, name: "" });
  });

  it("searches email and name, and pages", async () => {
    const db = memoryDb({ tables: fullTables(), users });
    expect((await adminUsers(db, { q: "RAVI" }, NOW)).users.map((u) => u.id)).toEqual(["u2"]);
    expect((await adminUsers(db, { q: "asha rao" }, NOW)).users.map((u) => u.id)).toEqual(["u1"]);
    const page = await adminUsers(db, { limit: 1, offset: 1 }, NOW);
    expect(page.total).toBe(3);
    expect(page.users.map((u) => u.id)).toEqual(["u2"]);
  });

  it("is an empty list when everything is missing", async () => {
    expect(await adminUsers(memoryDb({ missing: ALL_TABLES, authFails: true }), {}, NOW)).toEqual({ users: [], total: 0 });
  });
});

describe("adminUserDetail", () => {
  it("returns the profile, chart, stats, timeline, memory and usage", async () => {
    const d = (await adminUserDetail(memoryDb({ tables: fullTables(), users }), "u1", NOW))!;
    expect(d.user).toMatchObject({
      id: "u1",
      email: "asha@example.com",
      name: "Asha Rao",
      plan: "free",
      isAdmin: false,
      heavy: false,
      birth: { date: "1995-03-14", time: "06:30:00", timeKnown: true, place: "Pune", timezone: "Asia/Kolkata" },
      chart: { lagna: "Leo", moonSign: "Cancer", sunSign: "Pisces", mahadasha: "Saturn", antardasha: "Mercury", antardashaEnd: "2027-01-01" },
    });
    expect(d.stats).toEqual({
      readings: 4,
      deepReadings: 1,
      costUsd: 0.062,
      costUsd30d: 0.062,
      facts: 1,
      summaries: 1,
      predictionsOpen: 1,
      predictionsHappened: 1,
      predictionsDidnt: 0,
      lifeEvents: 1,
      alerts: 1,
      dailyReadings: 1,
      pushDevices: 1,
    });
    const kinds = d.timeline.map((e) => e.kind);
    expect(kinds).toContain("signup");
    expect(kinds.filter((k) => k === "deep_reading")).toHaveLength(1);
    expect(kinds.filter((k) => k === "reading")).toHaveLength(3);
    expect(kinds).toEqual(expect.arrayContaining(["daily", "alert", "life_event", "prediction", "prediction_resolved", "fact"]));
    expect([...d.timeline].sort((a, b) => b.at.localeCompare(a.at))).toEqual(d.timeline);
    expect(d.timeline.find((e) => e.kind === "reading")).toMatchObject({ title: "Career this year", refId: "c1" });
    expect(d.timeline.find((e) => e.kind === "reading")!.detail).not.toContain("**");
    expect(d.conversations).toEqual([
      { id: "c1", title: "Career this year", mode: "vedic", createdAt: ago(3), lastMessageAt: expect.any(String), messages: 8 },
    ]);
    expect(d.memory.facts[0]).toEqual({ id: "f1", fact: "Works as a nurse in Pune", category: "work", confidence: "stated", source: "chat", updatedAt: ago(3) });
    expect(d.memory.summaries[0]).toMatchObject({ conversationId: "c1", topics: ["work"] });
    expect(d.memory.predictions.map((p) => p.status).sort()).toEqual(["happened", "open"]);
    expect(d.usage).toHaveLength(30);
    expect(d.usage.at(-1)).toMatchObject({ day: "2026-10-05", readings: 3, costUsd: 0.062 });
  });

  it("reads timeKnown from the unknown-birth-time column when it exists", async () => {
    const t = fullTables();
    (t.birth_profiles[0] as Record<string, unknown>).birth_time_known = false;
    const d = (await adminUserDetail(memoryDb({ tables: t, users }), "u1", NOW))!;
    expect(d.user.birth?.timeKnown).toBe(false);
  });

  it("falls back to the 0008 fact columns when 0009 is not applied", async () => {
    const d = (await adminUserDetail(memoryDb({ tables: fullTables(), users, missing: ["user_facts.confidence"] }), "u1", NOW))!;
    expect(d.memory.facts[0]).toMatchObject({ id: "f1", confidence: "stated", source: "chat" });
  });

  it("degrades to zeros and empty lists when only auth knows the user", async () => {
    const d = (await adminUserDetail(memoryDb({ users, missing: ALL_TABLES }), "u2", NOW))!;
    expect(d.user).toMatchObject({ id: "u2", birth: null, chart: null, isAdmin: false });
    expect(Object.values(d.stats).every((v) => v === 0)).toBe(true);
    expect(d.timeline.map((e) => e.kind)).toEqual(["signup"]);
    expect(d.conversations).toEqual([]);
    expect(d.memory).toEqual({ facts: [], summaries: [], predictions: [] });
  });

  it("is null for an unknown user", async () => {
    expect(await adminUserDetail(memoryDb({ tables: fullTables(), users }), "nobody", NOW)).toBeNull();
  });
});

describe("adminConversation", () => {
  it("returns the transcript oldest first", async () => {
    const c = (await adminConversation(memoryDb({ tables: fullTables(), users }), "c2"))!;
    expect(c.conversation).toEqual({ id: "c2", userId: "u2", title: "Reading", mode: "numerology", createdAt: ago(1) });
    expect(c.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("is null when missing or unknown", async () => {
    expect(await adminConversation(memoryDb({ tables: fullTables() }), "nope")).toBeNull();
    expect(await adminConversation(memoryDb({ missing: ALL_TABLES }), "c1")).toBeNull();
  });
});
