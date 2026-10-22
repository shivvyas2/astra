import { describe, it, expect, vi } from "vitest";

vi.mock("./apns", () => ({
  isPushConfigured: () => true,
  ApnsClient: class {},
}));

import { pushToUserDevices } from "./devices";
import type { ApnsClient, PushEnvironment } from "./apns";

/** A device_tokens table with one row, recording what the code changes. */
function fakeAdmin(row: { token: string; environment: PushEnvironment }) {
  const calls = { updated: [] as unknown[], deleted: [] as unknown[] };
  const admin = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: [row] }) }),
      update: (values: unknown) => ({ eq: async () => void calls.updated.push(values) }),
      delete: () => ({ in: async (_: string, tokens: unknown) => void calls.deleted.push(tokens) }),
    }),
  };
  return { admin, calls };
}

/** An APNs client that accepts the token only on `works`. */
function fakeApns(works: PushEnvironment | null) {
  const hosts: PushEnvironment[] = [];
  const apns = {
    send: async ({ environment }: { environment: PushEnvironment }) => {
      hosts.push(environment);
      return environment === works
        ? { ok: true, status: 200, reason: "", unregistered: false }
        : { ok: false, status: 400, reason: "BadDeviceToken", unregistered: true };
    },
  } as unknown as ApnsClient;
  return { apns, hosts };
}

const payload = { title: "t", body: "b", alertId: "a1" };

describe("pushToUserDevices", () => {
  it("retries a wrong-host token on the other host and remembers it", async () => {
    const { admin, calls } = fakeAdmin({ token: "tok", environment: "sandbox" });
    const { apns, hosts } = fakeApns("production");
    const sent = await pushToUserDevices(admin as never, apns, "u1", payload);
    expect(sent).toBe(1);
    expect(hosts).toEqual(["sandbox", "production"]);
    expect(calls.updated).toEqual([{ environment: "production" }]);
    expect(calls.deleted).toEqual([]);
  });

  it("drops a token that neither host accepts", async () => {
    const { admin, calls } = fakeAdmin({ token: "tok", environment: "production" });
    const { apns } = fakeApns(null);
    const sent = await pushToUserDevices(admin as never, apns, "u1", payload);
    expect(sent).toBe(0);
    expect(calls.deleted).toEqual([["tok"]]);
  });

  it("sends once when the stored host is right", async () => {
    const { admin, calls } = fakeAdmin({ token: "tok", environment: "production" });
    const { apns, hosts } = fakeApns("production");
    expect(await pushToUserDevices(admin as never, apns, "u1", payload)).toBe(1);
    expect(hosts).toEqual(["production"]);
    expect(calls.updated).toEqual([]);
  });
});
