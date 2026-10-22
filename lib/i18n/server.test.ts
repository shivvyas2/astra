import { describe, it, expect, vi, beforeEach } from "vitest";

// getLocale reads the request through next/headers and the stored language
// through Supabase; both are stood in for here.
const request = { cookies: [] as { name: string; value: string }[], headers: new Map<string, string>() };
let stored: unknown = null;
let queried = 0;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => request.cookies,
    get: (name: string) => request.cookies.find((c) => c.name === name),
  }),
  headers: async () => ({ get: (name: string) => request.headers.get(name) ?? null }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: () => ({
      select: () => ({
        maybeSingle: async () => {
          queried += 1;
          return { data: stored === null ? null : { reading_language: stored }, error: null };
        },
      }),
    }),
  }),
}));

const { getLocale } = await import("./server");

const session = { name: "sb-abc-auth-token", value: "x" };

beforeEach(() => {
  request.cookies = [];
  request.headers = new Map();
  stored = null;
  queried = 0;
});

describe("getLocale", () => {
  it("uses a signed-in person's stored language over the cookie and the browser", async () => {
    request.cookies = [session, { name: "astrya-lang", value: "hi" }];
    request.headers.set("accept-language", "hi");
    stored = "gujarati";
    expect(await getLocale()).toBe("gu");
  });

  it("uses the cookie when there is no stored language", async () => {
    request.cookies = [session, { name: "astrya-lang", value: "hi" }];
    request.headers.set("accept-language", "gu");
    expect(await getLocale()).toBe("hi");
  });

  it("uses Accept-Language for a visitor without a cookie, and skips the query", async () => {
    request.headers.set("accept-language", "gu-IN,gu;q=0.9,en;q=0.5");
    expect(await getLocale()).toBe("gu");
    expect(queried).toBe(0);
  });

  it("falls back to English", async () => {
    request.headers.set("accept-language", "fr");
    expect(await getLocale()).toBe("en");
  });

  it("keeps the admin dashboard in English", async () => {
    request.cookies = [{ name: "astrya-lang", value: "gu" }];
    request.headers.set("x-astrya-path", "/admin/users");
    expect(await getLocale()).toBe("en");
  });
});
