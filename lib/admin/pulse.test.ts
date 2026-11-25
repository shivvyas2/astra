import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { adminPulse, BURST, burstsOf, loadPeople, stageOf } from "./pulse";
import { memoryDb } from "./testDb";

const NOW = new Date("2026-11-25T12:00:00.000Z");
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();
const user = (id: string, extra: object = {}) => ({ id, email: `${id}@example.com`, created_at: ago(20), last_sign_in_at: ago(20), ...extra });

function db(extra: Record<string, unknown[]> = {}, missing: string[] = []) {
  return memoryDb({
    missing,
    users: [
      user("boss"),
      user("never", { last_sign_in_at: null }),
      user("bare", { created_at: ago(0, 2) , last_sign_in_at: ago(0, 2) }),
      user("detailed"),
      user("agreed"),
      user("once"),
      user("back"),
    ],
    tables: {
      admins: [{ user_id: "boss" }],
      birth_profiles: ["boss", "detailed", "agreed", "once", "back"].map((user_id) => ({ user_id, first_name: user_id, last_name: "" })),
      ai_consents: ["agreed", "once", "back"].map((user_id) => ({ user_id })),
      conversations: [{ id: "c1", user_id: "once" }, { id: "c2", user_id: "back" }, { id: "c3", user_id: "boss" }, { id: "c4", user_id: "agreed" }],
      messages: [
        { conversation_id: "c1", role: "user", content: "q", created_at: ago(3) },
        { conversation_id: "c1", role: "assistant", content: "a", created_at: ago(3, -0.01) },
        { conversation_id: "c2", role: "user", content: "q", created_at: ago(5) },
        { conversation_id: "c2", role: "assistant", content: "a", created_at: ago(5, -0.01) },
        { conversation_id: "c2", role: "user", content: "q2", created_at: ago(1) },
        { conversation_id: "c3", role: "user", content: "owner testing", created_at: ago(1) },
        { conversation_id: "c4", role: "user", content: en.chat.welcome, created_at: ago(2) },
        { conversation_id: "c4", role: "assistant", content: "Hello", created_at: ago(2, -0.01) },
      ],
      user_activity: [{ user_id: "agreed", last_seen_at: ago(0, 1) }, { user_id: "boss", last_seen_at: ago(0, 1) }],
      daily_active: [{ day: "2026-11-24", users: 4 }],
      ...extra,
    } as never,
  }) as never;
}

describe("the pulse", () => {
  it("counts people, never admins", async () => {
    const p = await adminPulse(db(), 30, NOW);
    expect(p.totals).toMatchObject({ users: 6, joinedToday: 1, activeToday: 2 });
    expect(p.totals.active7).toBe(4);
    expect(p.series.at(-1)).toMatchObject({ day: "2026-11-25", total: 6, joined: 1, active: 2 });
    expect(p.series.find((d) => d.day === "2026-11-24")?.active).toBe(4);
    expect(p.series.find((d) => d.day === "2026-11-20")?.active).toBe(1);
  });
  it("shows where people stop, and the biggest drop", async () => {
    const p = await adminPulse(db(), 30, NOW);
    expect(p.funnel.map((f) => f.reached)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(p.funnel.map((f) => f.lost)).toEqual([0, 1, 1, 1, 1, 1]);
    const { stage } = await loadPeople(db());
    expect(Object.fromEntries(stage)).toEqual({ never: "signed_up", bare: "signed_in", detailed: "profile", agreed: "consented", once: "asked", back: "returned" });
  });
  it("does not take the app's own opening line for a question", async () => {
    const { asked } = await loadPeople(db());
    expect(asked.has("agreed")).toBe(false);
  });
  it("lists what went unanswered, with no words from it", async () => {
    const p = await adminPulse(db(), 30, NOW);
    expect(p.failures).toMatchObject({ unanswered: 1, people: 1, neverConfirmed: 1 });
    expect(p.failures.recent[0]).toMatchObject({ conversationId: "c2", name: "back" });
    expect(JSON.stringify(p)).not.toContain("q2");
  });
  it("flags repeats, not a single slip, and forgets after a week", async () => {
    const flags = (user_id: string, kind: string, n: number, days = 1) => Array.from({ length: n }, () => ({ user_id, kind, created_at: ago(days) }));
    const p = await adminPulse(db({ chat_flags: [...flags("once", "off_topic", 4), ...flags("back", "off_topic", 5), ...flags("bare", "abuse", 1), ...flags("detailed", "instructions", 9, 8), ...flags("boss", "abuse", 3)] }), 30, NOW);
    expect(p.flags.users.map((u) => u.id).sort()).toEqual(["back", "bare"]);
    expect(p.flags).toMatchObject({ offTopic7: 9, abuse7: 1, instructions7: 0 });
  });
  it("works before its migration", async () => {
    const p = await adminPulse(db({}, ["daily_active", "chat_flags", "user_activity"]), 30, NOW);
    expect(p.counting).toBe(false);
    expect(p.flags.users).toEqual([]);
    expect(p.totals.users).toBe(6);
  });
});

it("a person who asked before consent was recorded still counts as asking", () => {
  expect(stageOf(user("x") as never, { profile: true, consent: false, days: 1 })).toBe("asked");
});

it("a burst is many questions in a few minutes, not over an afternoon", () => {
  const conv = new Map([["c", "u"]]);
  const at = (gapMinutes: number, n: number) => Array.from({ length: n }, (_, i) => ({ conversation_id: "c", role: "user", created_at: new Date(NOW.getTime() + i * gapMinutes * 60_000).toISOString() }));
  expect(burstsOf(at(0.2, BURST.questions), conv, "2026").get("u")).toBe(BURST.questions);
  expect(burstsOf(at(3, 40), conv, "2026").size).toBe(0);
});
