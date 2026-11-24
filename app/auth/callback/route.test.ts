import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const exchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ auth: { exchangeCodeForSession: exchange } }) }));
import { GET } from "./route";

const go = async (q: string) => (await GET(new Request(`https://x.test/auth/callback${q}`))).headers.get("location");
let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { spy = vi.spyOn(console, "error").mockImplementation(() => {}); exchange.mockReset(); });
afterEach(() => spy.mockRestore());

describe("an email link", () => {
  it("signs in when it can", async () => {
    exchange.mockResolvedValue({ error: null });
    expect(await go("?code=abc")).toBe("https://x.test/app");
  });
  it("says so when it was opened somewhere else, or has expired", async () => {
    exchange.mockResolvedValue({ error: { code: "bad_code_verifier" } });
    expect(await go("?code=abc")).toBe("https://x.test/login?error=linkExpired");
    expect(await go("?error_code=otp_expired")).toBe("https://x.test/login?error=linkExpired");
  });
});
