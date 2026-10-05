import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, createRouteSupabase, saveBirthProfile } = vi.hoisted(() => {
  const getUser = vi.fn();
  return {
    getUser,
    createRouteSupabase: vi.fn(async () => ({ auth: { getUser } })),
    saveBirthProfile: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/supabase/route", () => ({ createRouteSupabase }));
vi.mock("@/lib/data/birthProfile", () => ({ saveBirthProfile }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: vi.fn() }));

import { POST } from "@/app/api/profile/route";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("https://astra.shivvyas.com/api/profile", { method: "POST", body: fd });
}

const valid = {
  first_name: "Shiv",
  last_name: "Vyas",
  birth_date: "1998-02-09",
  birth_time: "06:30",
  place_name: "Mumbai, India",
  lat: "19.076",
  lng: "72.8777",
  timezone: "Asia/Kolkata",
};

beforeEach(() => {
  getUser.mockReset();
  saveBirthProfile.mockReset();
});

describe("POST /api/profile", () => {
  it("returns 401 when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(form(valid));
    expect(res.status).toBe(401);
    expect(saveBirthProfile).not.toHaveBeenCalled();
  });

  it("saves the profile and returns 200 for a valid payload", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(form(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(saveBirthProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        firstName: "Shiv",
        lat: 19.076,
        timezone: "Asia/Kolkata",
      }),
      expect.anything(),
    );
  });

  it("returns 400 when a required field is missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const { timezone: _omitted, ...withoutTz } = valid;
    const res = await POST(form(withoutTz));
    expect(res.status).toBe(400);
    expect(saveBirthProfile).not.toHaveBeenCalled();
  });

  it("returns 400 when lat is not a number", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(form({ ...valid, lat: "not-a-number" }));
    expect(res.status).toBe(400);
    expect(saveBirthProfile).not.toHaveBeenCalled();
  });

  it("accepts an unknown birth time without a time, casting it for noon", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const { birth_time: _t, ...noTime } = valid;
    void _t;
    const res = await POST(form({ ...noTime, birth_time_known: "false" }));
    expect(res.status).toBe(200);
    expect(saveBirthProfile).toHaveBeenCalledWith(
      expect.objectContaining({ birthTimeKnown: false, birthTime: "12:00" }),
      expect.anything(),
    );
  });

  it("stores a rough part of day as its approximate time, still unknown", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(form({ ...valid, birth_time_known: "false", birth_time_approx: "evening" }));
    expect(res.status).toBe(200);
    expect(saveBirthProfile).toHaveBeenCalledWith(
      expect.objectContaining({ birthTimeKnown: false, birthTime: "19:00" }),
      expect.anything(),
    );
  });

  it("treats an old client that never sends the flag as knowing its time", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    await POST(form(valid));
    expect(saveBirthProfile).toHaveBeenCalledWith(
      expect.objectContaining({ birthTimeKnown: true, birthTime: "06:30" }),
      expect.anything(),
    );
  });

  it("returns 400 for a known time that is not a time", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(form({ ...valid, birth_time: "half six" }));
    expect(res.status).toBe(400);
    expect(saveBirthProfile).not.toHaveBeenCalled();
  });
});
