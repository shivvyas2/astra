import { describe, it, expect } from "vitest";
import { bearerTokenFrom } from "@/lib/supabase/route";

const req = (headers: Record<string, string>) =>
  new Request("https://astra.shivvyas.com/api/chat", { headers });

describe("bearerTokenFrom", () => {
  it("extracts the token from an Authorization header", () => {
    expect(bearerTokenFrom(req({ authorization: "Bearer abc.def.ghi" }))).toBe("abc.def.ghi");
  });

  it("accepts a lowercase scheme", () => {
    expect(bearerTokenFrom(req({ authorization: "bearer abc.def.ghi" }))).toBe("abc.def.ghi");
  });

  it("returns null when the header is absent", () => {
    expect(bearerTokenFrom(req({}))).toBeNull();
  });

  it("returns null for a non-bearer scheme", () => {
    expect(bearerTokenFrom(req({ authorization: "Basic dXNlcjpwYXNz" }))).toBeNull();
  });

  it("returns null when the scheme is present but the token is empty", () => {
    expect(bearerTokenFrom(req({ authorization: "Bearer " }))).toBeNull();
  });
});
