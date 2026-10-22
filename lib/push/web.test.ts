import { describe, it, expect } from "vitest";
import { buildWebPayload, isWebPushConfigured, pushToWebSubscriptions } from "./web";

describe("web push", () => {
  it("gives the service worker a title, body, tag and the Today page to open", () => {
    const p = JSON.parse(buildWebPayload({ title: "T", body: "B", alertId: "a1", threadId: "x" }));
    expect(p).toEqual({ title: "T", body: "B", tag: "x", url: "/app/today" });
  });

  it("sends nothing and touches nothing without VAPID keys", async () => {
    expect(isWebPushConfigured()).toBe(false);
    const admin = { from: () => { throw new Error("should not query"); } };
    expect(await pushToWebSubscriptions(admin as never, "u1", { title: "T", body: "B", alertId: "a" })).toEqual([]);
  });
});
