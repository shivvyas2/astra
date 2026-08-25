import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above module-level consts, so the stub must be created
// inside vi.hoisted() for the factory to be able to close over it.
const { createServerSupabase } = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

// computeChart hits the Swiss Ephemeris WASM binary; stub it for a unit test.
vi.mock("@/lib/astrology/chart", () => ({
  computeChart: vi.fn(async () => ({ stub: true })),
}));

import { saveBirthProfile } from "@/lib/data/birthProfile";
import { appendMessage } from "@/lib/data/chat";

function fakeDb() {
  const upsert = vi.fn(async () => ({ error: null }));
  const insert = vi.fn(async () => ({ error: null }));
  return {
    client: { from: vi.fn(() => ({ upsert, insert })) },
    upsert,
    insert,
  };
}

beforeEach(() => {
  createServerSupabase.mockReset();
});

describe("data helpers accept an injected client", () => {
  it("saveBirthProfile writes through the injected client", async () => {
    const db = fakeDb();
    await saveBirthProfile(
      {
        userId: "user-1",
        firstName: "Shiv",
        lastName: "Vyas",
        birthDate: "1998-02-09",
        birthTime: "06:30",
        placeName: "Mumbai, India",
        lat: 19.076,
        lng: 72.8777,
        timezone: "Asia/Kolkata",
      },
      db.client as never,
    );

    expect(db.client.from).toHaveBeenCalledWith("birth_profiles");
    expect(db.upsert).toHaveBeenCalledOnce();
    expect(createServerSupabase).not.toHaveBeenCalled();
  });

  it("appendMessage writes through the injected client", async () => {
    const db = fakeDb();
    await appendMessage("conv-1", "user", "hello", db.client as never);

    expect(db.client.from).toHaveBeenCalledWith("messages");
    expect(db.insert).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      role: "user",
      content: "hello",
    });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });

  it("falls back to the cookie client when none is injected", async () => {
    const db = fakeDb();
    createServerSupabase.mockResolvedValue(db.client);

    await appendMessage("conv-1", "user", "hello");

    expect(createServerSupabase).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalledOnce();
  });
});
