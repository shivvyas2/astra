import { describe, it, expect } from "vitest";
import { codeDigits, decodePendingEmail, emailCodeError, encodePendingEmail, isExistingAccount, looksLikeEmail } from "./pendingEmail";

describe("the pending email", () => {
  it("round-trips, plus signs and all", () => {
    for (const purpose of ["signIn", "signUp"] as const) {
      const p = { email: "asha+astrya@example.co.in", purpose };
      expect(decodePendingEmail(encodePendingEmail(p))).toEqual(p);
    }
  });
  it("is null when the cookie is missing or tampered with", () => {
    for (const raw of [undefined, "", "asha@example.com", "admin:asha@example.com", "signIn:nope", "signIn:a@b@c.com"]) {
      expect(decodePendingEmail(raw)).toBeNull();
    }
  });
});

it("recognises an email address", () => {
  for (const ok of ["a@b.co", "asha.rao@mail.example.com"]) expect(looksLikeEmail(ok)).toBe(true);
  for (const bad of ["", "a", "a@b", "a b@c.com", "@b.com", "a@.com", "a@b..com"]) expect(looksLikeEmail(bad)).toBe(false);
});

it("keeps only a code's digits", () => {
  expect(codeDigits(" 123-456. ")).toBe("123456");
  expect(codeDigits("12345678")).toBe("123456");
  expect(codeDigits(null)).toBe("");
});

it("knows the made-up user Supabase returns for an existing account", () => {
  expect(isExistingAccount({ identities: [] })).toBe(true);
  expect(isExistingAccount({ identities: [{}] })).toBe(false);
  expect(isExistingAccount({})).toBe(false);
  expect(isExistingAccount(null)).toBe(false);
});

it("reduces Supabase's words to ours", () => {
  expect(emailCodeError("Token has expired or is invalid")).toBe("codeInvalid");
  expect(emailCodeError("For security purposes, you can only request this after 51 seconds.")).toBe("rateLimit");
  expect(emailCodeError("email rate limit exceeded")).toBe("rateLimit");
  expect(emailCodeError("Email address \"x\" is invalid")).toBe("emailInvalid");
  expect(emailCodeError("weird")).toBe("other");
});
