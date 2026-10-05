import { describe, it, expect, vi } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";

/** The chat route's consent gate: no reading, and no model call, without agreement. */

const h = vi.hoisted(() => ({
  consent: { data: null } as { data?: unknown; error?: unknown },
  stream: vi.fn(),
}));

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: () => ({ messages: { stream: h.stream, create: h.stream } }),
  READING_MODEL: "m",
  DEEP_READING_MODEL: "m",
  supportsAdaptiveThinking: () => false,
  READING_EFFORT: {},
  DEEP_EFFORT: {},
  LOW_EFFORT: {},
}));
vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db } = fakeDb((call: Call) => (call.table === "ai_consents" ? h.consent : {}));
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } });
  }),
}));

import { POST } from "./route";

const ask = () =>
  POST(new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ tradition: "vedic", message: "hi" }) }));

describe("POST /api/chat consent gate", () => {
  it("answers 403 consent_required before any model call when the user has not agreed", async () => {
    h.consent = { data: null };
    const res = await ask();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "consent_required" });
    expect(h.stream).not.toHaveBeenCalled();
  });

  it("does not block when ai_consents does not exist yet (fails open)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.consent = { error: { code: "PGRST205", message: "ai_consents schema cache" } };
    const res = await ask();
    expect(res.status).not.toBe(403);
  });
});
