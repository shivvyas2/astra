import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, type Call } from "@/lib/facts/testDb";
import { CONSENT_VERSION, resetConsentLogForTests } from "@/lib/billing/consent";

const h = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  respond: (() => ({})) as (call: Call) => { data?: unknown; error?: unknown },
  calls: [] as Call[],
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: h.cookieSet, delete: h.cookieDelete }),
}));

vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabase: vi.fn(async () => {
    const { db, calls } = fakeDb((call) => h.respond(call));
    h.calls = calls;
    return Object.assign(db as object, { auth: { getUser: async () => ({ data: { user: h.user } }) } });
  }),
}));

import { GET, POST, DELETE } from "./route";

const MISSING = { code: "PGRST205", message: "Could not find the table 'public.ai_consents' in the schema cache" };
const post = (body: unknown) =>
  POST(new Request("http://x/api/consent", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  h.user = { id: "u1" };
  h.respond = () => ({});
  h.cookieSet.mockReset();
  h.cookieDelete.mockReset();
  resetConsentLogForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("/api/consent", () => {
  it("requires a session", async () => {
    h.user = null;
    expect((await GET(new Request("http://x/api/consent"))).status).toBe(401);
    expect((await post({ version: CONSENT_VERSION, platform: "ios" })).status).toBe(401);
  });

  it("GET reports the current version and whether it was accepted", async () => {
    h.respond = () => ({ data: { version: CONSENT_VERSION } });
    const body = await (await GET(new Request("http://x/api/consent"))).json();
    expect(body).toEqual({ accepted: true, version: CONSENT_VERSION, currentVersion: CONSENT_VERSION, stored: true });
  });

  it("POST records the current version", async () => {
    const res = await post({ version: CONSENT_VERSION, platform: "ios" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: true, stored: true });
    expect(h.calls[0].table).toBe("ai_consents");
    expect(h.cookieSet).not.toHaveBeenCalled();
  });

  it("POST refuses a stale notice version and a bad platform", async () => {
    expect((await post({ version: "2020-01-01", platform: "ios" })).status).toBe(409);
    expect((await post({ version: CONSENT_VERSION, platform: "android" })).status).toBe(400);
  });

  it("POST from the web falls back to a cookie while the table is missing", async () => {
    h.respond = () => ({ error: MISSING });
    const res = await post({ version: CONSENT_VERSION, platform: "web" });
    expect(await res.json()).toMatchObject({ accepted: true, stored: false });
    expect(h.cookieSet).toHaveBeenCalledWith("astrya_ai_consent", CONSENT_VERSION, expect.any(Object));
  });

  it("DELETE withdraws and clears the cookie", async () => {
    const res = await DELETE(new Request("http://x/api/consent", { method: "DELETE" }));
    expect(await res.json()).toMatchObject({ accepted: false });
    expect(h.calls[0].ops[0].op).toBe("delete");
    expect(h.cookieDelete).toHaveBeenCalledWith("astrya_ai_consent");
  });
});
