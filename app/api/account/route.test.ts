import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, deleteUser, createRouteSupabase, createAdminSupabase } = vi.hoisted(() => {
  const getUser = vi.fn();
  const deleteUser = vi.fn();
  return {
    getUser,
    deleteUser,
    createRouteSupabase: vi.fn(async () => ({ auth: { getUser } })),
    createAdminSupabase: vi.fn(() => ({ auth: { admin: { deleteUser } } })),
  };
});

vi.mock("@/lib/supabase/route", () => ({ createRouteSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase }));

import { DELETE } from "@/app/api/account/route";

const req = () => new Request("https://astra.shivvyas.com/api/account", { method: "DELETE" });

beforeEach(() => {
  getUser.mockReset();
  deleteUser.mockReset();
});

describe("DELETE /api/account", () => {
  it("returns 401 and deletes nothing when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(req());
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes only the calling user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    deleteUser.mockResolvedValue({ error: null });
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns 500 when deletion fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    deleteUser.mockResolvedValue({ error: { message: "boom" } });
    const res = await DELETE(req());
    expect(res.status).toBe(500);
  });
});
