import { describe, it, expect, vi } from "vitest";
import { failureReason, isAccountProblem, healthFrom, loadAiHealth } from "./ai";

const NOW = new Date("2026-11-24T12:00:00Z");
const m = (conversation_id: string, role: string, created_at: string) => ({ conversation_id, role, created_at });
const SUCCESS = "2026-11-22T16:26:00+00:00";

describe("healthFrom", () => {
  it("is down once two conversations wait since the last success", () => {
    const rows = [m("a", "user", "2026-11-23T01:00:00Z"), m("b", "user", "2026-11-23T02:00:00Z")];
    expect(healthFrom(rows, SUCCESS, NOW)).toEqual({ down: true, lastSuccessAt: SUCCESS, unanswered: 2 });
  });
  it("is not down for one waiting question, however often it was asked", () => {
    const rows = [m("a", "user", "2026-11-23T01:00:00Z"), m("a", "user", "2026-11-23T01:05:00Z")];
    expect(healthFrom(rows, SUCCESS, NOW)).toMatchObject({ down: false, unanswered: 1 });
  });
  it("ignores what was answered, what came before the last success, and what is still being answered", () => {
    const rows = [
      m("a", "user", "2026-11-23T01:00:00Z"), m("a", "assistant", "2026-11-23T01:00:20Z"),
      m("b", "user", "2026-11-22T10:00:00Z"),
      m("c", "user", "2026-11-24T11:59:00Z"),
    ];
    expect(healthFrom(rows, SUCCESS, NOW)).toMatchObject({ down: false, unanswered: 0 });
  });
  it("compares times, not strings, across offsets", () => {
    const rows = [m("a", "user", "2026-11-22T21:00:00+05:30"), m("b", "user", "2026-11-22T21:10:00+05:30")];
    expect(healthFrom(rows, SUCCESS, NOW).unanswered).toBe(0);
  });
});

describe("loadAiHealth", () => {
  it("says nothing when it cannot read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadAiHealth({ from: () => { throw new Error("x"); } }, NOW)).toBeNull();
    spy.mockRestore();
  });
});

describe("isAccountProblem", () => {
  it("is a refused key or bill, not a busy moment or an odd reply", () => {
    expect(isAccountProblem("400 invalid_request_error")).toBe(true);
    expect(isAccountProblem("401 authentication_error")).toBe(true);
    for (const r of ["529 overloaded_error", "unparseable reply", "unknown", undefined]) expect(isAccountProblem(r)).toBe(false);
  });
});

describe("failureReason", () => {
  it("keeps the status and type, and nothing the API said about anyone", () => {
    const err = Object.assign(new Error("Asha's key"), { status: 400, error: { error: { type: "invalid_request_error", message: "secret" } } });
    expect(failureReason(err)).toBe("400 invalid_request_error");
    expect(failureReason(new Error("Asha"))).toBe("unknown");
  });
});
