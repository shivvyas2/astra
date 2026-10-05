import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUser, listPeople, createPerson } = vi.hoisted(() => ({
  getUser: vi.fn(),
  listPeople: vi.fn(),
  createPerson: vi.fn(),
}));

vi.mock("@/lib/supabase/route", () => ({ createRouteSupabase: vi.fn(async () => ({ auth: { getUser } })) }));
vi.mock("@/lib/profiles/store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/profiles/store")>();
  return { ...real, listPeople, createPerson };
});

import { GET, POST } from "@/app/api/profiles/route";

const json = (body: unknown) =>
  new Request("https://astra.shivvyas.com/api/profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const person = {
  label: "Mom",
  relationship: "parent",
  first_name: "Meena",
  birth_date: "1968-11-02",
  birth_time_known: false,
  place_name: "Ahmedabad, India",
  lat: 23.02,
  lng: 72.57,
  timezone: "Asia/Kolkata",
};

beforeEach(() => {
  getUser.mockReset();
  listPeople.mockReset();
  createPerson.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("/api/profiles", () => {
  it("401s without a user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(new Request("https://x/api/profiles"))).status).toBe(401);
    expect((await POST(json(person))).status).toBe(401);
  });

  it("lists people, saying whether the feature is available", async () => {
    listPeople.mockResolvedValue({ people: [], available: false });
    const res = await GET(new Request("https://x/api/profiles"));
    expect(await res.json()).toMatchObject({ people: [], available: false });
  });

  it("creates a person with an unknown birth time", async () => {
    createPerson.mockResolvedValue({ ok: true, person: { id: "p1", owner_id: "user-1", ...person } });
    const res = await POST(json(person));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.person.owner_id).toBeUndefined();
    expect(createPerson).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ label: "Mom", relationship: "parent", birthTimeKnown: false, birthTime: "12:00" }),
    );
  });

  it("400s on invalid details without touching the database", async () => {
    const res = await POST(json({ ...person, relationship: "landlord" }));
    expect(res.status).toBe(400);
    expect(createPerson).not.toHaveBeenCalled();
  });

  it("never answers 402: past the anti-abuse ceiling it is a friendly 400", async () => {
    createPerson.mockResolvedValue({ ok: false, reason: "ceiling" });
    const res = await POST(json(person));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/as many as one account can hold/);
    expect(JSON.stringify(body)).not.toMatch(/plan_required|plus/i);
  });

  it("503s with a friendly message before migration 0012", async () => {
    createPerson.mockResolvedValue({ ok: false, reason: "unavailable" });
    const res = await POST(json(person));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/isn't switched on yet/);
  });
});
