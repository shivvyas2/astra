# Astra iOS — Backend API for Native Clients — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a native iOS client authenticate to the existing Astra API with a bearer token, complete birth intake, and delete its account — without changing any web behaviour.

**Architecture:** Route handlers currently resolve the user from cookies via `createServerSupabase()`. We add a bearer-aware factory that returns a Supabase client authorised by an `Authorization: Bearer <jwt>` header when present, falling back to the cookie client otherwise. Data helpers gain an optional trailing client parameter that defaults to the cookie client, so every existing web caller is untouched. Two new routes cover what the web does through server actions (intake) and what Apple requires (account deletion).

**Tech Stack:** Next.js 15 App Router, `@supabase/ssr`, `@supabase/supabase-js`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-astra-ios-native-design.md`

## Global Constraints

- **The web app's behaviour must not change.** Every existing caller of a modified function must keep working with no call-site edits.
- **Do not modify** the astrology engine (`lib/astrology/**`), the prompt builder, the Supabase schema, or RLS policies.
- **`SUPABASE_SERVICE_ROLE_KEY` never leaves the server.** Only `lib/supabase/admin.ts` may read it, and only behind an auth check.
- **Routes touching `swisseph-wasm` or `pdf-lib` must keep `export const runtime = "nodejs"`.**
- **Tests use vitest** (`npm test`), node environment, files matching `**/*.test.ts`.
- **Production origin:** `https://astra.shivvyas.com`.

### Deviation from the spec

The spec lists `/api/geocode` as needing bearer auth. It has **no auth today** (`app/api/geocode/route.ts` is a public lookup) and the iOS app can call it as-is. Adding auth there would be a behaviour change for no benefit, so this plan leaves it alone. Bearer auth applies to `/api/chat` and `/api/kundli` only.

---

### Task 1: Bearer-aware Supabase client for route handlers

**Files:**
- Create: `lib/supabase/route.ts`
- Create: `lib/supabase/route.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `createServerSupabase` from `lib/supabase/server.ts`, `env` from `lib/env.ts`.
- Produces:
  - `type Db = SupabaseClient`
  - `bearerTokenFrom(request: Request): string | null`
  - `createRouteSupabase(request: Request): Promise<Db>`

- [ ] **Step 1: Add the `@/` alias to vitest**

`vitest.config.ts` has no alias, so a test importing `@/lib/...` fails with "Failed to load url". Every later task's test needs it.

The `server-only` alias is equally necessary and less obvious: `lib/env.ts` and the route modules import `server-only`, whose default entry **throws** with "This module cannot be imported from a Client Component module". Next resolves it through the `react-server` export condition to an empty no-op; vitest does not. Setting `resolve.conditions: ["react-server"]` does **not** fix it (verified — vitest's SSR resolution ignores it), so alias the package directly at its no-op build.

**This config is verified working** — the full pre-existing suite (12 tests) passes with it, and a probe importing `@/lib/supabase/server` and `@/lib/env` succeeds.

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: { environment: "node", include: ["**/*.test.ts"] },
  resolve: {
    alias: {
      "@": root("./"),
      // Route handlers and lib/env.ts import "server-only", whose default entry
      // throws outside a React Server Component. Next resolves it via the
      // "react-server" export condition to an empty no-op; vitest does not, so
      // point at that same no-op explicitly to make server modules testable.
      "server-only": root("./node_modules/server-only/empty.js"),
    },
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `lib/supabase/route.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/supabase/route.test.ts`
Expected: FAIL — cannot resolve `@/lib/supabase/route` (the file does not exist yet).

- [ ] **Step 4: Write the implementation**

Create `lib/supabase/route.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Both the cookie client (@supabase/ssr) and the bearer client (supabase-js)
// are SupabaseClient instances, so callers can accept either.
export type Db = SupabaseClient;

/**
 * Pulls the JWT out of an `Authorization: Bearer <jwt>` header.
 * Returns null when absent, malformed, or a different scheme.
 */
export function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolves the caller's Supabase client for a route handler.
 *
 * Native clients send a bearer token; the returned client forwards it, so RLS
 * evaluates as that user. Web callers send cookies and fall through to the
 * existing cookie-backed client, leaving web behaviour unchanged.
 */
export async function createRouteSupabase(request: Request): Promise<Db> {
  const token = bearerTokenFrom(request);
  if (!token) return createServerSupabase();

  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/supabase/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Confirm the alias change broke nothing**

Run: `npm test`
Expected: the full suite passes, including the pre-existing astrology and geo tests.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts lib/supabase/route.ts lib/supabase/route.test.ts
git commit -m "feat(api): bearer-aware Supabase client for route handlers"
```

---

### Task 2: Thread an optional client through the data helpers

**Files:**
- Modify: `lib/data/birthProfile.ts`
- Modify: `lib/data/chat.ts`
- Create: `lib/data/injection.test.ts`

**Interfaces:**
- Consumes: `Db` from `lib/supabase/route.ts` (Task 1).
- Produces, all with the new optional trailing parameter:
  - `getBirthProfile(db?: Db): Promise<BirthProfileRow | null>`
  - `saveBirthProfile(input: {...}, db?: Db): Promise<void>`
  - `getOrCreateConversation(args: {...}, db?: Db): Promise<string>`
  - `appendMessage(conversationId: string, role: "user" | "assistant", content: string, db?: Db): Promise<void>`
  - `getMessages(conversationId: string, db?: Db)`
  - `listConversations(db?: Db)`

Every helper currently opens its own cookie client. Making the parameter **optional and trailing** means no existing call site changes.

- [ ] **Step 1: Write the failing test**

Create `lib/data/injection.test.ts`. This asserts the contract that matters: when a client is passed, the helper uses it and never opens a cookie client.

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/data/injection.test.ts`
Expected: FAIL — the helpers ignore the extra argument and call `createServerSupabase()` instead.

- [ ] **Step 3: Update `lib/data/birthProfile.ts`**

Add the import, then change only the two function signatures and their first line.

```ts
import type { Db } from "@/lib/supabase/route";
```

```ts
export async function getBirthProfile(db?: Db): Promise<BirthProfileRow | null> {
  const supabase = db ?? (await createServerSupabase());
  const { data } = await supabase.from("birth_profiles").select("*").maybeSingle();
  return (data as BirthProfileRow) ?? null;
}
```

```ts
export async function saveBirthProfile(
  input: {
    userId: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    birthTime: string;
    placeName: string;
    lat: number;
    lng: number;
    timezone: string;
    avatarUrl?: string | null;
  },
  db?: Db,
) {
  const supabase = db ?? (await createServerSupabase());
  // ...the rest of the body is unchanged...
}
```

- [ ] **Step 4: Update `lib/data/chat.ts`**

Add the same import, then change each of the four functions' signature and first line. Bodies are otherwise unchanged.

```ts
import type { Db } from "@/lib/supabase/route";
```

```ts
export async function getOrCreateConversation(
  args: { userId: string; conversationId?: string; tradition: ChatMode; title: string },
  db?: Db,
): Promise<string> {
  const supabase = db ?? (await createServerSupabase());
  // ...unchanged...
}

export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  db?: Db,
) {
  const supabase = db ?? (await createServerSupabase());
  // ...unchanged...
}

export async function getMessages(conversationId: string, db?: Db) {
  const supabase = db ?? (await createServerSupabase());
  // ...unchanged...
}

export async function listConversations(db?: Db) {
  const supabase = db ?? (await createServerSupabase());
  // ...unchanged...
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/data/injection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the web app still compiles and its callers are untouched**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, full suite green. No call site in `app/` should have needed an edit — if one did, the parameter was not added as optional and trailing.

- [ ] **Step 7: Commit**

```bash
git add lib/data/birthProfile.ts lib/data/chat.ts lib/data/injection.test.ts
git commit -m "refactor(data): accept an optional Supabase client, defaulting to cookies"
```

---

### Task 3: Accept bearer auth on /api/chat and /api/kundli

**Files:**
- Modify: `app/api/chat/route.ts` (lines 13-14, 90, 99, 104, 140)
- Modify: `app/api/kundli/route.ts` (lines 8-11)

**Interfaces:**
- Consumes: `createRouteSupabase` (Task 1); the injectable data helpers (Task 2).
- Produces: both routes authenticate a native client via bearer token, unchanged for web.

- [ ] **Step 1: Update `app/api/chat/route.ts`**

Replace the import and the first two lines of `POST`:

```ts
import { createRouteSupabase } from "@/lib/supabase/route";
```

```ts
export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
```

Then pass `supabase` to each data helper call so the bearer identity carries through rather than silently reverting to cookies. There are exactly four, at `app/api/chat/route.ts:90`, `:99`, `:104`, and `:140`:

```ts
    conversationId = await getOrCreateConversation(
      { userId: user.id, conversationId: body.conversationId, tradition: body.tradition, title: body.message },
      supabase,
    );
```

```ts
    const history = await getMessages(conversationId, supabase);
```

```ts
    await appendMessage(conversationId, "user", body.message, supabase);
```

And in the stream's `finally` block:

```ts
        if (full.trim()) await appendMessage(conversationId, "assistant", full, supabase);
```

The `createServerSupabase` import is now unused in this file — remove it.

- [ ] **Step 2: Update `app/api/kundli/route.ts`**

`GET` takes no argument today; it needs the request to read the header.

```ts
import { createRouteSupabase } from "@/lib/supabase/route";
```

```ts
export async function GET(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
```

Remove the now-unused `createServerSupabase` import.

- [ ] **Step 3: Verify types and the existing suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, suite green.

- [ ] **Step 4: Verify unauthenticated requests are still rejected**

Run the dev server (`npm run dev`) in one terminal, then:

```bash
curl -s -o /dev/null -w "no auth: %{http_code}\n" \
  -X POST http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"tradition":"vedic","message":"hi"}'

curl -s -o /dev/null -w "garbage token: %{http_code}\n" \
  -X POST http://localhost:3000/api/chat \
  -H 'authorization: Bearer not-a-real-jwt' \
  -H 'content-type: application/json' \
  -d '{"tradition":"vedic","message":"hi"}'

curl -s -o /dev/null -w "kundli no auth: %{http_code}\n" http://localhost:3000/api/kundli
```

Expected: `401` for all three. A `500` means the bearer client threw instead of returning a null user — fix before continuing.

- [ ] **Step 5: Verify the web app still works end to end**

In a browser, log in at `http://localhost:3000/login`, open a reading, and confirm the response streams and persists. This is the regression that matters most: cookie auth must be untouched.

- [ ] **Step 6: Commit**

```bash
git add app/api/chat/route.ts app/api/kundli/route.ts
git commit -m "feat(api): accept bearer-token auth on chat and kundli routes"
```

---

### Task 4: POST /api/profile for native intake

**Files:**
- Create: `app/api/profile/route.ts`
- Create: `app/api/profile/route.test.ts`

**Interfaces:**
- Consumes: `createRouteSupabase` (Task 1), `saveBirthProfile` (Task 2), `createAdminSupabase` from `lib/supabase/admin.ts`.
- Produces: `POST /api/profile` accepting `multipart/form-data`, mirroring `app/(app)/app/intake/actions.ts` but returning JSON instead of redirecting.

Intake is a server action today, which a native client cannot invoke. This route performs the same work. It accepts multipart because the optional avatar is a file.

- [ ] **Step 1: Write the failing test**

Create `app/api/profile/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const createRouteSupabase = vi.fn(async () => ({ auth: { getUser } }));
const saveBirthProfile = vi.fn(async () => {});

vi.mock("@/lib/supabase/route", () => ({ createRouteSupabase }));
vi.mock("@/lib/data/birthProfile", () => ({ saveBirthProfile }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: vi.fn() }));

import { POST } from "@/app/api/profile/route";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("https://astra.shivvyas.com/api/profile", { method: "POST", body: fd });
}

const valid = {
  first_name: "Shiv",
  last_name: "Vyas",
  birth_date: "1998-02-09",
  birth_time: "06:30",
  place_name: "Mumbai, India",
  lat: "19.076",
  lng: "72.8777",
  timezone: "Asia/Kolkata",
};

beforeEach(() => {
  getUser.mockReset();
  saveBirthProfile.mockReset();
});

describe("POST /api/profile", () => {
  it("returns 401 when there is no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(form(valid));
    expect(res.status).toBe(401);
    expect(saveBirthProfile).not.toHaveBeenCalled();
  });

  it("saves the profile and returns 200 for a valid payload", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(form(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(saveBirthProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        firstName: "Shiv",
        lat: 19.076,
        timezone: "Asia/Kolkata",
      }),
      expect.anything(),
    );
  });

  it("returns 400 when a required field is missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const { timezone, ...withoutTz } = valid;
    const res = await POST(form(withoutTz));
    expect(res.status).toBe(400);
    expect(saveBirthProfile).not.toHaveBeenCalled();
  });

  it("returns 400 when lat is not a number", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(form({ ...valid, lat: "not-a-number" }));
    expect(res.status).toBe(400);
    expect(saveBirthProfile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/profile/route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/profile/route`.

- [ ] **Step 3: Write the implementation**

Create `app/api/profile/route.ts`:

```ts
import { createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { saveBirthProfile } from "@/lib/data/birthProfile";

// swisseph-wasm runs during chart computation inside saveBirthProfile.
export const runtime = "nodejs";

const REQUIRED = [
  "first_name",
  "last_name",
  "birth_date",
  "birth_time",
  "place_name",
  "lat",
  "lng",
  "timezone",
] as const;

async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const admin = createAdminSupabase();
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (error) return null;
  const { data } = admin.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function POST(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const form = await request.formData();

  for (const field of REQUIRED) {
    const value = form.get(field);
    if (typeof value !== "string" || value.trim() === "") {
      return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng must be numbers" }, { status: 400 });
  }

  let avatarUrl: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0 && photo.type.startsWith("image/")) {
    avatarUrl = await uploadAvatar(user.id, photo);
  }

  try {
    await saveBirthProfile(
      {
        userId: user.id,
        firstName: String(form.get("first_name")),
        lastName: String(form.get("last_name")),
        birthDate: String(form.get("birth_date")),
        birthTime: String(form.get("birth_time")),
        placeName: String(form.get("place_name")),
        lat,
        lng,
        timezone: String(form.get("timezone")),
        avatarUrl,
      },
      supabase,
    );
  } catch (err) {
    console.error("profile save error", err);
    return Response.json({ error: "Could not compute your chart. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/profile/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify types and the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, suite green.

- [ ] **Step 6: Commit**

```bash
git add app/api/profile/route.ts app/api/profile/route.test.ts
git commit -m "feat(api): POST /api/profile for native birth-detail intake"
```

---

### Task 5: DELETE /api/account for App Store compliance

**Files:**
- Create: `app/api/account/route.ts`
- Create: `app/api/account/route.test.ts`

**Interfaces:**
- Consumes: `createRouteSupabase` (Task 1), `createAdminSupabase` from `lib/supabase/admin.ts`.
- Produces: `DELETE /api/account`, deleting the caller's auth user.

Apple guideline 5.1.1(v) requires in-app account deletion for any app offering signup. `auth.users` cascades to `profiles`, `birth_profiles`, `conversations`, and `messages` (`supabase/migrations/0001_init.sql`), so deleting the auth user removes everything. Deletion needs the service-role client, which is why the caller's identity is verified first.

- [ ] **Step 1: Write the failing test**

Create `app/api/account/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const deleteUser = vi.fn();
const createRouteSupabase = vi.fn(async () => ({ auth: { getUser } }));
const createAdminSupabase = vi.fn(() => ({ auth: { admin: { deleteUser } } }));

vi.mock("@/lib/supabase/route", () => ({ createRouteSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase }));

import { DELETE } from "@/app/api/account/route";

const req = () => new Request("https://astra.shivvyas.com/api/account", { method: "DELETE" });

beforeEach(() => {
  getUser.mockReset();
  deleteUser.mockReset();
});

describe("DELETE /api/account", () => {
  it("returns 401 and deletes nothing when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(req());
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes only the calling user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    deleteUser.mockResolvedValue({ error: null });
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns 500 when deletion fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    deleteUser.mockResolvedValue({ error: { message: "boom" } });
    const res = await DELETE(req());
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/account/route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/account/route`.

- [ ] **Step 3: Write the implementation**

Create `app/api/account/route.ts`:

```ts
import { createRouteSupabase } from "@/lib/supabase/route";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Permanently deletes the calling user's account.
 * Required by App Store Review Guideline 5.1.1(v).
 *
 * The user id comes from the verified session, never from the request body,
 * so a caller can only ever delete themselves. Rows in profiles,
 * birth_profiles, conversations, and messages cascade from auth.users.
 */
export async function DELETE(request: Request) {
  const supabase = await createRouteSupabase(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const admin = createAdminSupabase();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("account deletion error", error);
    return Response.json({ error: "Could not delete your account. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/account/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify types and the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, suite green.

- [ ] **Step 6: Commit**

```bash
git add app/api/account/route.ts app/api/account/route.test.ts
git commit -m "feat(api): DELETE /api/account for in-app account deletion"
```

---

### Task 6: Universal Links association file

**Files:**
- Create: `public/.well-known/apple-app-site-association`
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `https://astra.shivvyas.com/.well-known/apple-app-site-association`, served as JSON with no auth redirect.

Without this, tapping a Supabase confirmation or magic-link email opens Safari, the session cookie lands in Safari rather than the app, and a new user can never finish signing up on iOS.

**Note:** the file has **no `.json` extension** — Apple requires exactly this filename. The `appID` is `<TEAM_ID>.<BUNDLE_ID>`; both values are open items in the spec. Use the real Team ID from the Apple Developer account before deploying — a placeholder here silently breaks Universal Links.

- [ ] **Step 1: Check the current middleware matcher**

`middleware.ts` matches `/((?!_next/static|_next/image|favicon.ico|images/).*)`, which **includes** `/.well-known/*`. Every request to the association file would run `updateSession`, which can attach cookies and interfere with how Apple's CDN fetches it. Apple requires an unauthenticated `200` with `content-type: application/json`.

- [ ] **Step 2: Exclude `.well-known` from the middleware**

```ts
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|\\.well-known/).*)"],
};
```

- [ ] **Step 3: Create the association file**

Create `public/.well-known/apple-app-site-association`, substituting the real Team ID and bundle identifier:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.shivvyas.astra",
        "paths": ["/auth/callback", "/auth/callback?*"]
      }
    ]
  },
  "webcredentials": {
    "apps": ["TEAMID.com.shivvyas.astra"]
  }
}
```

`webcredentials` lets iOS offer the saved Astra password in the app's login field.

- [ ] **Step 4: Verify it is served correctly in dev**

With `npm run dev` running:

```bash
curl -sI http://localhost:3000/.well-known/apple-app-site-association | head -5
```

Expected: `200`, and a `content-type` of `application/json`. If Next serves it as `application/octet-stream`, add a header rule to `next.config.ts`:

```ts
async headers() {
  return [
    {
      source: "/.well-known/apple-app-site-association",
      headers: [{ key: "content-type", value: "application/json" }],
    },
  ];
}
```

- [ ] **Step 5: Verify the middleware change did not break auth**

In a browser, log out and log back in at `http://localhost:3000/login`. Session refresh must still work — `updateSession` still runs for every route except the excluded ones.

- [ ] **Step 6: Commit**

```bash
git add public/.well-known/apple-app-site-association middleware.ts next.config.ts
git commit -m "feat(ios): serve Universal Links association file"
```

---

### Task 7: Verify the whole surface against production

**Files:** none — this is a verification gate before the iOS work depends on it.

- [ ] **Step 1: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 2: Verify the association file is live and correct**

```bash
curl -sI https://astra.shivvyas.com/.well-known/apple-app-site-association | head -5
```

Expected: `200` and `content-type: application/json`. Apple's CDN will not accept a redirect here.

- [ ] **Step 3: Verify the routes reject unauthenticated callers**

```bash
for path in /api/chat /api/profile; do
  curl -s -o /dev/null -w "$path: %{http_code}\n" -X POST "https://astra.shivvyas.com$path"
done
curl -s -o /dev/null -w "/api/kundli: %{http_code}\n" https://astra.shivvyas.com/api/kundli
curl -s -o /dev/null -w "/api/account: %{http_code}\n" -X DELETE https://astra.shivvyas.com/api/account
```

Expected: `401` for all four.

- [ ] **Step 4: Verify a real bearer token works end to end**

Get an access token by signing in through the Supabase REST endpoint, then call `/api/kundli` with it:

```bash
TOKEN=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H 'content-type: application/json' \
  -d '{"email":"YOUR_TEST_EMAIL","password":"YOUR_TEST_PASSWORD"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

curl -s -o /dev/null -w "kundli with bearer: %{http_code}\n" \
  -H "authorization: Bearer $TOKEN" https://astra.shivvyas.com/api/kundli
```

Expected: `200` for an account that has completed intake. **This is the single most important check in the plan** — it proves a native client can authenticate. If it returns `401`, the bearer client is not forwarding the token; revisit Task 1.

- [ ] **Step 5: Verify the web app is unchanged**

Log in at `https://astra.shivvyas.com/login`, start a reading, confirm it streams, and download the kundli PDF from the profile page.

- [ ] **Step 6: Commit any fixes and tag the milestone**

```bash
git commit --allow-empty -m "chore: backend ready for native iOS clients"
```

---

## What comes next

This plan is the first of four. It ships and is testable on its own; the iOS app depends on it.

- **Plan 2 — iOS foundation, auth, and intake.** Xcode project, `Theme.swift` from the four tokens, `supabase-swift` with Keychain session, Universal Link handling, auth and intake screens.
- **Plan 3 — Chat and profile.** Streaming reading via `URLSession.bytes`, markdown rendering, tradition switcher, past conversations, chart display, kundli PDF share sheet, account deletion UI.
- **Plan 4 — Native capabilities and submission.** Push notifications, Face ID lock, haptics, offline cache, icon, screenshots, privacy policy, nutrition label, TestFlight, submission.

The open scope question — whether Plan 4 is the full set or push notifications only — does not affect Plans 1 through 3.
