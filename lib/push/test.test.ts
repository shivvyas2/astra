import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ works: "production" as "production" | "sandbox" | null, hosts: [] as string[] }));

vi.mock("./apns", () => ({
  isPushConfigured: () => true,
  ApnsClient: class {
    async send({ environment }: { environment: "sandbox" | "production" }) {
      h.hosts.push(environment);
      return environment === h.works
        ? { ok: true, status: 200, unregistered: false }
        : { ok: false, status: 400, reason: "BadDeviceToken", unregistered: true };
    }
    close() {}
  },
}));

import { sendTestPush } from "./test";

function fakeAdmin() {
  const calls = { updated: [] as unknown[], deleted: 0 };
  const rows = [{ token: "aaaaaaaaaaaa12345678", environment: "sandbox", updated_at: "2026-10-22T00:00:00Z" }];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }),
      update: (values: unknown) => ({ eq: async () => void calls.updated.push(values) }),
      delete: () => ({ in: async () => void (calls.deleted += 1) }),
    }),
  };
  return { admin, calls };
}

describe("sendTestPush", () => {
  it("reports both attempts, fixes the stored host, and deletes nothing", async () => {
    h.works = "production";
    h.hosts = [];
    const { admin, calls } = fakeAdmin();
    const report = await sendTestPush(admin as never, "u1");
    expect(report.configured).toBe(true);
    expect(report.devices).toHaveLength(1);
    expect(report.devices[0].tokenTail).toBe("12345678");
    expect(report.devices[0].attempts.map((a) => [a.environment, a.ok])).toEqual([["sandbox", false], ["production", true]]);
    expect(report.devices[0].delivered).toBe(true);
    expect(calls.updated).toEqual([{ environment: "production" }]);
    expect(calls.deleted).toBe(0);
  });

  it("never deletes a token that fails everywhere", async () => {
    h.works = null;
    const { admin, calls } = fakeAdmin();
    const report = await sendTestPush(admin as never, "u1");
    expect(report.devices[0].delivered).toBe(false);
    expect(calls.deleted).toBe(0);
  });
});
