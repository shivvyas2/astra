import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, upsert, deleteEqToken, deleteEqUser, from, createRouteSupabase, createAdminSupabase } =
  vi.hoisted(() => {
    const getUser = vi.fn();
    const upsert = vi.fn();
    const deleteEqUser = vi.fn();
    const deleteEqToken = vi.fn(() => ({ eq: deleteEqUser }));
    const from = vi.fn(() => ({
      upsert,
      delete: () => ({ eq: deleteEqToken }),
    }));
    return {
      getUser,
      upsert,
      deleteEqToken,
      deleteEqUser,
      from,
      createRouteSupabase: vi.fn(async () => ({ auth: { getUser } })),
      createAdminSupabase: vi.fn(() => ({ from })),
    };
  });

vi.mock("@/lib/supabase/route", () => ({ createRouteSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase }));

import { POST, DELETE } from "@/app/api/devices/route";

const TOKEN = "a".repeat(64);

function post(body: unknown) {
  return new Request("https://astra.shivvyas.com/api/devices", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUser.mockReset();
  upsert.mockReset();
  deleteEqUser.mockReset();
  upsert.mockResolvedValue({ error: null });
  deleteEqUser.mockResolvedValue({ error: null });
});

describe("POST /api/devices", () => {
  it("rejects an unauthenticated caller", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ token: TOKEN }));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed token", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(post({ token: "not-a-token" }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stores the token against the session user, not the body", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(post({ token: TOKEN, environment: "sandbox", user_id: "someone-else" }));
    expect(res.status).toBe(200);
    const [row, options] = upsert.mock.calls[0];
    expect(row).toMatchObject({ token: TOKEN, user_id: "user-1", environment: "sandbox", platform: "ios" });
    expect(options).toEqual({ onConflict: "token" });
  });

  it("defaults an unknown environment to production", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    await POST(post({ token: TOKEN, environment: "nonsense" }));
    expect(upsert.mock.calls[0][0]).toMatchObject({ environment: "production" });
  });
});

describe("DELETE /api/devices", () => {
  it("deletes only this user's row for that token", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await DELETE(
      new Request("https://astra.shivvyas.com/api/devices", {
        method: "DELETE",
        body: JSON.stringify({ token: TOKEN }),
      }),
    );
    expect(res.status).toBe(200);
    expect(deleteEqToken).toHaveBeenCalledWith("token", TOKEN);
    expect(deleteEqUser).toHaveBeenCalledWith("user_id", "user-1");
  });
});
