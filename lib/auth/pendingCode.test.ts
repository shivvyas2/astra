import { describe, it, expect } from "vitest";
import { clock, codeDigits, codeError, codeTimers, decodePending, encodePending, isDisposableEmail, isExistingAccount, looksLikeEmail, resendWait } from "./pendingCode";

describe("the waiting code", () => {
  it("round-trips", () => {
    for (const p of [
      { to: "asha+astrya@example.co.in", purpose: "signIn", sentAt: 1_790_000_000_000, resends: 2 },
      { to: "a@b.co", purpose: "signUp", sentAt: 0, resends: 0 },
      { to: "+919876543210", purpose: "phone", sentAt: 1, resends: 0 },
    ] as const) expect(decodePending(encodePending(p))).toEqual(p);
  });
  it("is null when missing, old, or tampered with", () => {
    for (const raw of [undefined, "", "signIn:a@b.co", "admin:1:0:a@b.co", "signIn:1:0:nope", "phone:1:0:a@b.co", "signIn:1:0:+919876543210", "signIn:x:0:a@b.co"]) {
      expect(decodePending(raw)).toBeNull();
    }
  });
});

describe("timers", () => {
  const p = { purpose: "signIn", sentAt: 1_000_000, resends: 0 } as const;
  it("count down to another code and to this one running out", () => {
    expect(codeTimers(p, 1_000_000)).toEqual({ resendIn: 60, expiresIn: 3600 });
    expect(codeTimers(p, 1_045_500)).toEqual({ resendIn: 15, expiresIn: 3555 });
    expect(codeTimers(p, 9_000_000)).toEqual({ resendIn: 0, expiresIn: 0 });
  });
  it("wait longer each time, and texts run out sooner", () => {
    expect([0, 1, 2, 3, 9].map(resendWait)).toEqual([60, 60, 120, 300, 300]);
    expect(codeTimers({ ...p, purpose: "phone" }, 1_000_000).expiresIn).toBe(600);
  });
  it("are not fooled by a clock that is behind", () => {
    expect(codeTimers(p, 0)).toEqual({ resendIn: 60, expiresIn: 3600 });
  });
  it("read as a clock", () => expect([0, 9, 60, 725].map(clock)).toEqual(["0:00", "0:09", "1:00", "12:05"]));
});

it("recognises an email address", () => {
  for (const ok of ["a@b.co", "asha.rao@mail.example.com"]) expect(looksLikeEmail(ok)).toBe(true);
  for (const bad of ["", "a", "a@b", "a b@c.com", "@b.com", "a@.com", "a@b..com"]) expect(looksLikeEmail(bad)).toBe(false);
});
it("keeps only a code's digits", () => {
  expect(codeDigits(" 123-456. ")).toBe("123456");
  expect(codeDigits(null)).toBe("");
});
it("knows throwaway inboxes, and leaves real ones alone", () => {
  for (const bad of ["x@mailinator.com", "x@eu.YOPMAIL.com"]) expect(isDisposableEmail(bad)).toBe(true);
  for (const ok of ["x@gmail.com", "x@privaterelay.appleid.com", "x@notmailinator.com"]) expect(isDisposableEmail(ok)).toBe(false);
});
it("knows the made-up user Supabase returns for an existing account", () => {
  expect(isExistingAccount({ identities: [] })).toBe(true);
  expect(isExistingAccount({ identities: [{}] })).toBe(false);
  expect(isExistingAccount(null)).toBe(false);
});
it("reduces Supabase's words to ours", () => {
  expect(codeError("Token has expired or is invalid")).toBe("codeInvalid");
  expect(codeError("For security purposes, you can only request this after 51 seconds.")).toBe("rateLimit");
  expect(codeError("email rate limit exceeded")).toBe("sendBusy");
  expect(codeError("Error sending confirmation email")).toBe("sendFailed");
  expect(codeError("fetch failed")).toBe("sendFailed");
  expect(codeError("Unsupported phone provider")).toBe("phoneUnavailable");
  expect(codeError("weird")).toBe("other");
});
