import { describe, expect, it } from "vitest";
import { buildApnsPayload } from "@/lib/push/apns";

describe("buildApnsPayload", () => {
  it("wakes the app in the background so widgets refresh before the tap", () => {
    const payload = JSON.parse(buildApnsPayload({ title: "T", body: "B", alertId: "a1" }));
    expect(payload.aps["content-available"]).toBe(1);
  });

  it("keeps the visible alert and the routing fields the app reads", () => {
    const payload = JSON.parse(
      buildApnsPayload({ title: "Sade Sati begins", body: "Saturn moves", alertId: "a1", kind: "daily", threadId: "t" }),
    );
    expect(payload.aps.alert).toEqual({ title: "Sade Sati begins", body: "Saturn moves" });
    expect(payload.aps.sound).toBe("default");
    expect(payload.aps["thread-id"]).toBe("t");
    expect(payload.alert_id).toBe("a1");
    expect(payload.kind).toBe("daily");
  });

  it("defaults to an alert in the shared thread", () => {
    const payload = JSON.parse(buildApnsPayload({ title: "T", body: "B", alertId: "a1" }));
    expect(payload.kind).toBe("alert");
    expect(payload.aps["thread-id"]).toBe("sanchara-alerts");
  });
});
