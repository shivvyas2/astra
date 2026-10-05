import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memoryDb } from "@/lib/admin/testDb";
import { resetAdminLogForTests } from "@/lib/admin/stats";

/**
 * The admin JSON API that the iOS admin decodes: auth (cookie or bearer,
 * 401 / 403 / 200), response shapes, and a database missing every optional
 * table, which must read as zeros and empty lists, never a 500.
 */

const h = vi.hoisted(() => ({
  // Which user each credential resolves to.
  cookieUser: null as null | { id: string },
  tokens: {} as Record<string, { id: string }>,
  getUserArgs: [] as unknown[],
  db: null as unknown,
}));

vi.mock("@/lib/supabase/route", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/route")>("@/lib/supabase/route");
  return {
    bearerTokenFrom: actual.bearerTokenFrom,
    createRouteSupabase: vi.fn(async (request: Request) => {
      const token = actual.bearerTokenFrom(request);
      return {
        auth: {
          getUser: async (jwt?: string) => {
            h.getUserArgs.push(jwt);
            const user = token ? (h.tokens[jwt ?? token] ?? null) : h.cookieUser;
            return { data: { user }, error: user ? null : { message: "no session" } };
          },
        },
      };
    }),
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => h.db }));

import { GET as me } from "./me/route";
import { GET as overview } from "./overview/route";
import { GET as users } from "./users/route";
import { GET as user } from "./users/[id]/route";
import { GET as conversation } from "./conversations/[id]/route";

const url = (path: string) => `https://astra.shivvyas.com/api/admin/${path}`;
const req = (path: string, headers: Record<string, string> = {}) => new Request(url(path), { headers });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const authUsers = [
  { id: "admin-1", email: "owner@example.com", created_at: "2026-09-01T00:00:00.000Z" },
  { id: "u1", email: "asha@example.com", created_at: "2026-10-01T00:00:00.000Z" },
];
const tables = {
  admins: [{ user_id: "admin-1" }],
  birth_profiles: [{ user_id: "u1", first_name: "Asha", last_name: "Rao", place_name: "Pune" }],
  conversations: [{ id: "c1", user_id: "u1", tradition: "western", title: "Love", created_at: "2026-10-02T00:00:00.000Z" }],
  messages: [
    { conversation_id: "c1", role: "user", content: "When will I marry?", created_at: "2026-10-02T00:00:00.000Z" },
    { conversation_id: "c1", role: "assistant", content: "Venus says 2027.", created_at: "2026-10-02T00:00:10.000Z" },
  ],
};
const OPTIONAL = [
  "model_usage",
  "user_facts",
  "conversation_memories",
  "predictions",
  "daily_readings",
  "alerts",
  "device_tokens",
  "life_events",
];

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  resetAdminLogForTests();
  h.cookieUser = null;
  h.tokens = {};
  h.getUserArgs = [];
  h.db = memoryDb({ tables, users: authUsers });
  spies = [vi.spyOn(console, "warn"), vi.spyOn(console, "error")].map((s) => s.mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("admin API auth", () => {
  const all: [string, () => Promise<Response>][] = [
    ["overview", () => overview(req("overview"))],
    ["users", () => users(req("users"))],
    ["users/:id", () => user(req("users/u1"), params("u1"))],
    ["conversations/:id", () => conversation(req("conversations/c1"), params("c1"))],
  ];

  it.each(all)("%s is 401 when signed out", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(401);
  });

  it.each(all)("%s is 403 {error:'forbidden'} for a signed-in non-admin", async (_name, call) => {
    h.cookieUser = { id: "u1" };
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it.each(all)("%s is 200 for an admin's cookie session", async (_name, call) => {
    h.cookieUser = { id: "admin-1" };
    expect((await call()).status).toBe(200);
  });

  it("accepts the iOS bearer token and verifies that exact token", async () => {
    h.tokens["tok-admin"] = { id: "admin-1" };
    const res = await overview(req("overview?days=7", { authorization: "Bearer tok-admin" }));
    expect(res.status).toBe(200);
    expect(h.getUserArgs).toContain("tok-admin");
    expect((await res.json()).days).toBe(7);
  });

  it("is 401 for an invalid bearer token even with an admin cookie present", async () => {
    h.cookieUser = { id: "admin-1" };
    const res = await users(req("users", { authorization: "Bearer expired" }));
    expect(res.status).toBe(401);
  });

  it("/me answers any signed-in user, never 403", async () => {
    expect((await me(req("me"))).status).toBe(401);
    h.cookieUser = { id: "u1" };
    let res = await me(req("me"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isAdmin: false });
    h.tokens["t"] = { id: "admin-1" };
    res = await me(req("me", { authorization: "Bearer t" }));
    expect(await res.json()).toEqual({ isAdmin: true });
  });

  it("/me is {isAdmin:false} when the admins table cannot be read", async () => {
    h.cookieUser = { id: "admin-1" };
    h.db = memoryDb({ missing: ["admins"] });
    expect(await (await me(req("me"))).json()).toEqual({ isAdmin: false });
  });
});

describe("admin API shapes", () => {
  beforeEach(() => {
    h.cookieUser = { id: "admin-1" };
  });

  it("overview has every contract field, with optional tables missing", async () => {
    h.db = memoryDb({ tables, users: authUsers, missing: OPTIONAL });
    const res = await overview(req("overview"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["days", "generatedAt", "kinds", "models", "modes", "series", "topUsers", "totals"]);
    expect(Object.keys(body.totals).sort()).toEqual(
      [
        "users",
        "newUsers",
        "activeUsers7d",
        "readings",
        "readingsToday",
        "deepShare",
        "costUsd",
        "costToday",
        "costPerReading",
        "facts",
        "conversationMemories",
        "predictionsOpen",
        "predictionsHappened",
        "predictionsDidnt",
        "predictionHitRate",
        "dailyReadings",
        "alertsSent",
        "pushDevices",
        "lifeEvents",
        "heavyUsers",
      ].sort(),
    );
    expect(body.totals.users).toBe(2);
    expect(body.totals.readings).toBe(1);
    expect(body.totals.costUsd).toBe(0);
    expect(body.totals.predictionHitRate).toBeNull();
    expect(body.series).toHaveLength(30);
    expect(Object.keys(body.series[0]).sort()).toEqual(["activeUsers", "costUsd", "day", "readings", "signups"]);
    expect(body.series[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("users list items have the contract fields", async () => {
    const body = await (await users(req("users?q=asha&limit=10&offset=0"))).json();
    expect(body.total).toBe(1);
    expect(Object.keys(body.users[0]).sort()).toEqual(
      ["id", "email", "name", "place", "createdAt", "lastActiveAt", "plan", "readings", "readings7d", "costUsd30d", "facts", "predictionsOpen", "hasPush", "isAdmin", "heavy"].sort(),
    );
    expect(body.users[0]).toMatchObject({ id: "u1", name: "Asha Rao", readings: 1, plan: "free", hasPush: false });
  });

  it("user detail has the contract sections, and 404s for an unknown id", async () => {
    h.db = memoryDb({ tables, users: authUsers, missing: OPTIONAL });
    const res = await user(req("users/u1"), params("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["conversations", "memory", "stats", "timeline", "usage", "user"]);
    expect(body.user.birth).toEqual({ date: "", time: "", timeKnown: true, place: "Pune", timezone: "" });
    expect(body.memory).toEqual({ facts: [], summaries: [], predictions: [] });
    expect(body.conversations[0]).toMatchObject({ id: "c1", mode: "western", messages: 2 });
    expect(body.timeline.map((e: { kind: string }) => e.kind)).toEqual(["reading", "signup"]);
    const missing = await user(req("users/zzz"), params("zzz"));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });

  it("conversation returns the transcript, and 404s for an unknown id", async () => {
    const body = await (await conversation(req("conversations/c1"), params("c1"))).json();
    expect(body).toEqual({
      conversation: { id: "c1", userId: "u1", title: "Love", mode: "western", createdAt: "2026-10-02T00:00:00.000Z" },
      messages: [
        { role: "user", content: "When will I marry?", createdAt: "2026-10-02T00:00:00.000Z" },
        { role: "assistant", content: "Venus says 2027.", createdAt: "2026-10-02T00:00:10.000Z" },
      ],
    });
    expect((await conversation(req("conversations/nope"), params("nope"))).status).toBe(404);
  });

  it("never 500s on a database with nothing in it but the admins table", async () => {
    h.db = memoryDb({ tables: { admins: tables.admins }, missing: [...OPTIONAL, "birth_profiles", "conversations", "messages"] });
    expect((await overview(req("overview"))).status).toBe(200);
    expect((await users(req("users"))).status).toBe(200);
    expect((await conversation(req("conversations/c1"), params("c1"))).status).toBe(404);
  });
});
