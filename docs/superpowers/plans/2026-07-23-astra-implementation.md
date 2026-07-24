# Astra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Astra — a cosmic-styled Next.js web app where users sign up, enter birth details, and chat with a Claude-powered astrologer that interprets their real computed birth chart (Vedic or Western), with all chats stored in Supabase and a separate admin app that can read every user's transcripts.

**Architecture:** One Next.js 15 (App Router) + TypeScript + Tailwind app with three route zones — public marketing (`(marketing)`), authenticated consumer app (`(app)`), and an isolated admin app (`admin`). Supabase provides Postgres + Auth + Row-Level Security. A pure `chart` module computes real planetary positions with `swisseph-wasm` (tropical + sidereal/Lahiri). A streaming route handler builds a chart-grounded prompt and streams Claude's reading via `@anthropic-ai/sdk`, persisting every message.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, `@supabase/ssr` + `@supabase/supabase-js`, `swisseph-wasm`, `tz-lookup`, `luxon`, `@anthropic-ai/sdk`, Vitest for unit tests.

## Global Constraints

- Node.js ≥ 20. Package manager: `npm`.
- Product/brand name is exactly **Astra** everywhere user-visible (site title, auth, metadata).
- Astrology traditions supported: **Vedic (sidereal, Lahiri ayanamsa)** and **Western (tropical)**; user picks per conversation.
- Default reading model: `claude-sonnet-5`. Deep-reading model: `claude-opus-4-8`. Never use any other model string.
- Anthropic calls use `@anthropic-ai/sdk`, always streamed via `client.messages.stream(...)`, `max_tokens: 4096`, `thinking: { type: "adaptive" }`.
- Secrets live only in `.env.local` (gitignored) and Vercel env vars. The `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are **server-only** — never imported into a `"use client"` file or exposed with a `NEXT_PUBLIC_` prefix.
- Admin is a **separate, isolated** login at `/admin/login`; a consumer signup can never gain admin. Admin identity is checked server-side against an `admins` table.
- All user data tables are protected by RLS: a user reads/writes only rows where `user_id = auth.uid()`.
- Every reading UI shows the disclaimer: "For guidance and reflection. Not a substitute for professional advice."
- Hero imagery uses the provided photos copied into `public/images/`.

---

### Task 1: Scaffold the Next.js app, tooling, and assets

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (temporary placeholder)
- Create: `.env.example`
- Create: `public/images/starfield.jpg`, `public/images/planet-sun.jpg`
- Test: `app/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (greenfield).
- Produces: a running Next.js app; `app/globals.css` exposes Tailwind and the cosmic theme tokens (`--bg`, `--fg`, CSS is available to all later tasks); `.env.example` documents required keys.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "astra",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.68.0",
    "@supabase/ssr": "^0.7.0",
    "@supabase/supabase-js": "^2.58.0",
    "luxon": "^3.7.2",
    "next": "^15.5.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "swisseph-wasm": "^1.0.6",
    "tz-lookup": "^6.1.25"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/luxon": "^3.7.1",
    "@types/node": "^22.0.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Run install**

Run: `cd /Users/shivvyas/astra && npm install`
Expected: `node_modules/` created, no fatal errors. (If `swisseph-wasm`'s exact version 404s, run `npm view swisseph-wasm version` and pin the latest published version, then reinstall.)

- [ ] **Step 3: Create config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // swisseph-wasm ships a .wasm binary; keep it external so Next bundles it for the server runtime.
  serverExternalPackages: ["swisseph-wasm"],
};

export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["**/*.test.ts"] },
});
```

- [ ] **Step 4: Create the theme + layout**

`app/globals.css`:
```css
@import "tailwindcss";

:root {
  --bg: #0a0a0b;
  --fg: #f4f1ea;
  --muted: #9a978f;
  --accent: #e8663d;
}

@theme inline {
  --color-bg: var(--bg);
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --font-display: ui-sans-serif, system-ui, sans-serif;
}

html, body { background: var(--bg); color: var(--fg); }
* { box-sizing: border-box; }
```

`app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Astra — Your chart, read by the stars",
  description: "Sign up, share your birth details, and chat with an astrologer powered by your real birth chart.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

`app/page.tsx` (temporary — replaced in Task 13):
```tsx
export default function Home() {
  return <main className="p-10 text-2xl">Astra — coming together.</main>;
}
```

- [ ] **Step 5: Create `.env.example`**

```bash
# Supabase (Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic (console.anthropic.com → API Keys)
ANTHROPIC_API_KEY=
```

- [ ] **Step 6: Copy hero images into public/**

Run:
```bash
mkdir -p /Users/shivvyas/astra/public/images
cp "/Users/shivvyas/Downloads/pexels-apiwit-sriphoto-117224445-36368224.jpg" /Users/shivvyas/astra/public/images/starfield.jpg
cp "/Users/shivvyas/Downloads/pexels-zelch-30596307.jpg" /Users/shivvyas/astra/public/images/planet-sun.jpg
```
Expected: both files exist under `public/images/`.

- [ ] **Step 7: Write the smoke test**

`app/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import metadata from "./layout";

describe("app scaffold", () => {
  it("layout module loads", () => {
    expect(typeof metadata).toBe("function");
  });
});
```

- [ ] **Step 8: Run test + dev server**

Run: `cd /Users/shivvyas/astra && npm run test`
Expected: 1 passing test.
Run: `cd /Users/shivvyas/astra && npm run build`
Expected: build succeeds (placeholder home compiles).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Scaffold Astra Next.js app, theme, tooling, and hero assets"
```

---

### Task 2: Supabase schema and Row-Level Security

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `docs/SUPABASE_SETUP.md`

**Interfaces:**
- Produces tables: `profiles(id uuid pk = auth.users.id, display_name text, created_at)`, `birth_profiles(id uuid pk, user_id uuid fk, first_name, last_name, birth_date date, birth_time time, place_name, lat double precision, lng double precision, timezone text, chart jsonb, updated_at)`, `conversations(id uuid pk, user_id uuid fk, tradition text check in ('vedic','western'), title text, created_at)`, `messages(id uuid pk, conversation_id uuid fk, role text check in ('user','assistant'), content text, created_at)`, `admins(user_id uuid pk = auth.users.id, created_at)`.
- Produces SQL helper `public.is_admin()` returning boolean, used by later RLS/admin tasks.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_init.sql`:
```sql
-- Astra schema + RLS. Run in Supabase SQL editor or via CLI.

create extension if not exists "pgcrypto";

-- Admins: presence in this table = admin. No self-service path (no insert policy).
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.birth_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  birth_time time not null,
  place_name text not null,
  lat double precision not null,
  lng double precision not null,
  timezone text not null,
  chart jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id)
);
alter table public.birth_profiles enable row level security;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tradition text not null check (tradition in ('vedic','western')),
  title text,
  created_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create index on public.conversations (user_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create index on public.messages (conversation_id, created_at);

-- Auto-create a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- RLS: owner-only. Admin reads happen via the service-role client, which bypasses RLS.
create policy "profiles self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "birth self" on public.birth_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "conv self" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "msg self" on public.messages
  for all using (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.conversations c
            where c.id = messages.conversation_id and c.user_id = auth.uid())
  );

-- admins table: readable only by admins; never writable via API (no insert/update/delete policy).
create policy "admins read self-or-admin" on public.admins
  for select using (user_id = auth.uid() or public.is_admin());
```

- [ ] **Step 2: Write the setup doc**

`docs/SUPABASE_SETUP.md`:
```markdown
# Supabase setup for Astra

1. Create a project at https://supabase.com/dashboard (free tier is fine).
2. Project Settings → API. Copy into `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret — server only)
3. Authentication → Providers: enable **Email** (password) and **Email → Magic Link**.
4. SQL Editor → paste `supabase/migrations/0001_init.sql` → Run.
5. To make yourself an admin, sign up in the app first, then run in SQL editor:
   `insert into public.admins (user_id) values ('<your auth user id>');`
   (Find your id in Authentication → Users.)
```

- [ ] **Step 3: Apply and verify**

Run the migration in the Supabase SQL editor. Then verify RLS is on:
```sql
select relname, relrowsecurity from pg_class
where relname in ('profiles','birth_profiles','conversations','messages','admins');
```
Expected: `relrowsecurity = true` for all five.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Add Supabase schema, RLS policies, and setup doc"
```

---

### Task 3: Supabase clients and session middleware

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts`
- Create: `middleware.ts`
- Create: `lib/env.ts`

**Interfaces:**
- Produces: `createBrowserClient()` (client components), `createServerSupabase()` (server components/actions/route handlers — async, cookie-bound), `createAdminSupabase()` (service-role, server-only, RLS-bypassing), and `updateSession(request)` used by root middleware to refresh auth cookies.

- [ ] **Step 1: Env accessor**

`lib/env.ts`:
```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
};
```

- [ ] **Step 2: Browser client**

`lib/supabase/client.ts`:
```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Server client**

`lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore; middleware refreshes cookies.
        }
      },
    },
  });
}
```

- [ ] **Step 4: Admin (service-role) client**

`lib/supabase/admin.ts`:
```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Bypasses RLS. Only ever import from server code behind an admin auth check.
export function createAdminSupabase() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 5: Middleware session refresh**

`lib/supabase/middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/app");
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}
```

- [ ] **Step 6: Root middleware**

`middleware.ts`:
```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
```

- [ ] **Step 7: Build check + commit**

Run: `cd /Users/shivvyas/astra && npm run build`
Expected: build succeeds (with a populated `.env.local`; if env vars are absent the build still compiles because `env.*()` is only called at request time).
```bash
git add -A && git commit -m "Add Supabase browser/server/admin clients and auth middleware"
```

---

### Task 4: Consumer auth (email/password + magic link)

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`
- Create: `app/(auth)/actions.ts`
- Create: `app/auth/callback/route.ts`
- Create: `app/(auth)/layout.tsx`
- Create: `components/AuthForm.tsx`

**Interfaces:**
- Consumes: `createServerSupabase` (Task 3).
- Produces: server actions `signInWithPassword`, `signUpWithPassword`, `sendMagicLink`, `signOut`; a `/auth/callback` route that exchanges the magic-link/OAuth code for a session. After auth, users land on `/app`.

- [ ] **Step 1: Auth server actions**

`app/(auth)/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

export async function signInWithPassword(formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/app");
}

export async function signUpWithPassword(formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  redirect("/app");
}

export async function sendMagicLink(formData: FormData) {
  const supabase = await createServerSupabase();
  const origin = (await headers()).get("origin")!;
  const { error } = await supabase.auth.signInWithOtp({
    email: String(formData.get("email")),
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  const q = error ? `error=${encodeURIComponent(error.message)}` : "sent=1";
  redirect(`/login?${q}`);
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Callback route**

`app/auth/callback/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}/app`);
}
```

- [ ] **Step 3: Shared form component**

`components/AuthForm.tsx`:
```tsx
export function AuthForm({
  title,
  primaryLabel,
  primaryAction,
  magicAction,
  footer,
  error,
  notice,
}: {
  title: string;
  primaryLabel: string;
  primaryAction: (fd: FormData) => void;
  magicAction?: (fd: FormData) => void;
  footer: React.ReactNode;
  error?: string;
  notice?: string;
}) {
  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-4xl font-bold tracking-tight">{title}</h1>
      {error && <p className="mb-4 text-sm text-accent">{error}</p>}
      {notice && <p className="mb-4 text-sm text-muted">{notice}</p>}
      <form className="space-y-3">
        <input name="email" type="email" required placeholder="you@email.com"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-accent" />
        <input name="password" type="password" placeholder="password"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-accent" />
        <button formAction={primaryAction}
          className="w-full rounded-md bg-fg px-3 py-2 font-medium text-bg">{primaryLabel}</button>
        {magicAction && (
          <button formAction={magicAction}
            className="w-full rounded-md border border-white/20 px-3 py-2 text-sm">
            Email me a magic link instead
          </button>
        )}
      </form>
      <div className="mt-6 text-sm text-muted">{footer}</div>
    </div>
  );
}
```

- [ ] **Step 4: Auth layout + pages**

`app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center px-6">{children}</main>;
}
```

`app/(auth)/login/page.tsx`:
```tsx
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { signInWithPassword, sendMagicLink } from "../actions";

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthForm
      title="Welcome back"
      primaryLabel="Log in"
      primaryAction={signInWithPassword}
      magicAction={sendMagicLink}
      error={sp.error}
      notice={sp.sent ? "Check your email for a magic link." : undefined}
      footer={<>New here? <Link className="text-fg underline" href="/signup">Create an account</Link></>}
    />
  );
}
```

`app/(auth)/signup/page.tsx`:
```tsx
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { signUpWithPassword } from "../actions";

export default async function SignupPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthForm
      title="Create your Astra account"
      primaryLabel="Sign up"
      primaryAction={signUpWithPassword}
      error={sp.error}
      footer={<>Already have an account? <Link className="text-fg underline" href="/login">Log in</Link></>}
    />
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `/signup`, create an account with a real email → redirected to `/app` (which 404s until Task 7 — expected). Confirm the user appears in Supabase Authentication → Users and a `profiles` row was auto-created.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add consumer auth: signup, login, magic link, callback"
```

---

### Task 5: Geocoding + timezone resolution

**Files:**
- Create: `lib/geo.ts`
- Test: `lib/geo.test.ts`

**Interfaces:**
- Produces: `geocodePlace(query: string): Promise<GeoResult[]>` where `GeoResult = { name: string; lat: number; lng: number; timezone: string; country: string }`. Uses Open-Meteo geocoding (free, no key) for lat/lng and `tz-lookup` for the IANA timezone. Later tasks (7) call this for birthplace autocomplete.

- [ ] **Step 1: Write the failing test**

`lib/geo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveTimezone } from "./geo";

describe("resolveTimezone", () => {
  it("maps New Delhi coordinates to Asia/Kolkata", () => {
    expect(resolveTimezone(28.6139, 77.209)).toBe("Asia/Kolkata");
  });
  it("maps New York coordinates to America/New_York", () => {
    expect(resolveTimezone(40.7128, -74.006)).toBe("America/New_York");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- geo`
Expected: FAIL — `resolveTimezone` not exported.

- [ ] **Step 3: Implement `lib/geo.ts`**

```ts
// @ts-expect-error - tz-lookup ships no types
import tzlookup from "tz-lookup";

export type GeoResult = {
  name: string;
  lat: number;
  lng: number;
  timezone: string;
  country: string;
};

export function resolveTimezone(lat: number, lng: number): string {
  return tzlookup(lat, lng);
}

export async function geocodePlace(query: string): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: Array<{ name: string; latitude: number; longitude: number; country?: string; admin1?: string }>;
  };
  return (data.results ?? []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lng: r.longitude,
    timezone: resolveTimezone(r.latitude, r.longitude),
    country: r.country ?? "",
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- geo`
Expected: PASS (2 tests). `resolveTimezone` is offline; `geocodePlace` is exercised manually in Task 7.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add geocoding + timezone resolution"
```

---

### Task 6: Chart service (Vedic + Western)

**Files:**
- Create: `lib/astrology/chart.ts`, `lib/astrology/types.ts`, `lib/astrology/constants.ts`
- Test: `lib/astrology/chart.test.ts`

**Interfaces:**
- Consumes: `swisseph-wasm`, `luxon`.
- Produces:
  - `type BirthInput = { birthDate: string; birthTime: string; lat: number; lng: number; timezone: string; }` (`birthDate` = `YYYY-MM-DD`, `birthTime` = `HH:mm`).
  - `type Tradition = "vedic" | "western";`
  - `type Planet = { name: string; sign: string; degree: number; house: number; retrograde: boolean; nakshatra?: string; };`
  - `type Chart = { tradition: Tradition; ascendant: { sign: string; degree: number }; houses: number[]; planets: Planet[]; moonSign: string; sunSign: string; ayanamsa?: number; };`
  - `async function computeChart(input: BirthInput, tradition: Tradition): Promise<Chart>` — pure (no DB, no network). This is the accuracy core: it converts local birth time to UT via `luxon`, computes the Julian day, planetary longitudes (sidereal Lahiri for vedic, tropical for western), the ascendant, and Placidus houses.

- [ ] **Step 1: Constants**

`lib/astrology/constants.ts`:
```ts
export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

// 27 nakshatras, each 13°20' of the sidereal zodiac.
export const NAKSHATRAS = [
  "Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha",
  "Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha",
  "Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada",
  "Uttara Bhadrapada","Revati",
] as const;

export function signOf(longitude: number): string {
  const idx = Math.floor(((longitude % 360) + 360) % 360 / 30);
  return SIGNS[idx];
}

export function degreeInSign(longitude: number): number {
  return (((longitude % 30) + 30) % 30);
}

export function nakshatraOf(longitude: number): string {
  const idx = Math.floor(((longitude % 360) + 360) % 360 / (360 / 27));
  return NAKSHATRAS[idx];
}
```

- [ ] **Step 2: Types**

`lib/astrology/types.ts`:
```ts
export type Tradition = "vedic" | "western";

export type BirthInput = {
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:mm
  lat: number;
  lng: number;
  timezone: string; // IANA
};

export type Planet = {
  name: string;
  sign: string;
  degree: number;
  house: number;
  retrograde: boolean;
  nakshatra?: string;
};

export type Chart = {
  tradition: Tradition;
  ascendant: { sign: string; degree: number };
  houses: number[]; // 12 cusp longitudes
  planets: Planet[];
  moonSign: string;
  sunSign: string;
  ayanamsa?: number;
};
```

- [ ] **Step 3: Write the failing test**

`lib/astrology/chart.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeChart } from "./chart";

// Reference birth: 1990-01-01, 12:00 local, New Delhi (Asia/Kolkata).
const input = {
  birthDate: "1990-01-01",
  birthTime: "12:00",
  lat: 28.6139,
  lng: 77.209,
  timezone: "Asia/Kolkata",
};

describe("computeChart", () => {
  it("returns 12 house cusps, an ascendant, and all planets for western", async () => {
    const chart = await computeChart(input, "western");
    expect(chart.houses).toHaveLength(12);
    expect(chart.planets.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"]),
    );
    // Sun on Jan 1 is in Capricorn (tropical).
    expect(chart.sunSign).toBe("Capricorn");
    expect(chart.ascendant.degree).toBeGreaterThanOrEqual(0);
    expect(chart.ascendant.degree).toBeLessThan(30);
  });

  it("sidereal (vedic) sun sits ~24° behind tropical, landing in Sagittarius, with nakshatras", async () => {
    const vedic = await computeChart(input, "vedic");
    expect(vedic.sunSign).toBe("Sagittarius");
    expect(vedic.ayanamsa).toBeGreaterThan(22);
    expect(vedic.ayanamsa).toBeLessThan(26);
    const sun = vedic.planets.find((p) => p.name === "Sun")!;
    expect(sun.nakshatra).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- chart`
Expected: FAIL — `computeChart` not implemented.

- [ ] **Step 5: Implement `lib/astrology/chart.ts`**

```ts
import { DateTime } from "luxon";
import SwissEph from "swisseph-wasm";
import type { BirthInput, Chart, Planet, Tradition } from "./types";
import { degreeInSign, nakshatraOf, signOf, SIGNS } from "./constants";

// Lazily initialize the WASM module once per server process.
let swePromise: Promise<any> | null = null;
async function getSwe(): Promise<any> {
  if (!swePromise) {
    swePromise = (async () => {
      const swe = new SwissEph();
      await swe.initSwissEph();
      return swe;
    })();
  }
  return swePromise;
}

// Planets to compute. Rahu = mean north node; Ketu is derived (node + 180°).
const BODIES = [
  { name: "Sun", key: "SE_SUN" },
  { name: "Moon", key: "SE_MOON" },
  { name: "Mercury", key: "SE_MERCURY" },
  { name: "Venus", key: "SE_VENUS" },
  { name: "Mars", key: "SE_MARS" },
  { name: "Jupiter", key: "SE_JUPITER" },
  { name: "Saturn", key: "SE_SATURN" },
  { name: "Rahu", key: "SE_MEAN_NODE" },
] as const;

function houseOf(longitude: number, cusps: number[]): number {
  const lon = ((longitude % 360) + 360) % 360;
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    if (start <= end) {
      if (lon >= start && lon < end) return i + 1;
    } else {
      // wraps past 360°
      if (lon >= start || lon < end) return i + 1;
    }
  }
  return 1;
}

export async function computeChart(input: BirthInput, tradition: Tradition): Promise<Chart> {
  const swe = await getSwe();

  // 1. Local birth time -> UT.
  const local = DateTime.fromISO(`${input.birthDate}T${input.birthTime}`, { zone: input.timezone });
  const ut = local.toUTC();
  const decimalHour = ut.hour + ut.minute / 60 + ut.second / 3600;
  const jd = swe.julday(ut.year, ut.month, ut.day, decimalHour, swe.SE_GREG_CAL);

  // 2. Flags: sidereal (Lahiri) for vedic, tropical for western. Always want speed for retrograde.
  let iflag = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;
  let ayanamsa: number | undefined;
  if (tradition === "vedic") {
    swe.set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
    iflag |= swe.SEFLG_SIDEREAL;
    ayanamsa = swe.get_ayanamsa_ut(jd);
  }

  // 3. Houses + ascendant. 'P' = Placidus. In sidereal mode swisseph applies ayanamsa to cusps too.
  const houseSystem = "P".charCodeAt(0);
  const housesRes = swe.houses_ex(jd, iflag, input.lat, input.lng, houseSystem);
  const cusps: number[] = (housesRes.cusps ?? housesRes.house ?? []).slice(1, 13);
  const ascLon: number = housesRes.ascmc ? housesRes.ascmc[0] : (housesRes.ascendant ?? cusps[0]);

  // 4. Planets.
  const planets: Planet[] = [];
  for (const body of BODIES) {
    const res = swe.calc_ut(jd, (swe as any)[body.key], iflag);
    const lon: number = res.longitude ?? res.x?.[0] ?? res[0];
    const speed: number = res.longitudeSpeed ?? res.x?.[3] ?? 0;
    planets.push({
      name: body.name,
      sign: signOf(lon),
      degree: Number(degreeInSign(lon).toFixed(2)),
      house: houseOf(lon, cusps),
      retrograde: speed < 0,
      nakshatra: tradition === "vedic" ? nakshatraOf(lon) : undefined,
    });
  }
  // Ketu = Rahu + 180°. Reconstruct Rahu's absolute longitude from its sign + degree.
  const rahu = planets.find((p) => p.name === "Rahu")!;
  const rahuLon = SIGNS.indexOf(rahu.sign as (typeof SIGNS)[number]) * 30 + rahu.degree;
  const ketuLon = (rahuLon + 180) % 360;
  planets.push({
    name: "Ketu",
    sign: signOf(ketuLon),
    degree: Number(degreeInSign(ketuLon).toFixed(2)),
    house: houseOf(ketuLon, cusps),
    retrograde: true,
    nakshatra: tradition === "vedic" ? nakshatraOf(ketuLon) : undefined,
  });

  const sun = planets.find((p) => p.name === "Sun")!;
  const moon = planets.find((p) => p.name === "Moon")!;

  return {
    tradition,
    ascendant: { sign: signOf(ascLon), degree: Number(degreeInSign(ascLon).toFixed(2)) },
    houses: cusps.map((c) => Number(c.toFixed(2))),
    planets,
    moonSign: moon.sign,
    sunSign: sun.sign,
    ayanamsa: ayanamsa !== undefined ? Number(ayanamsa.toFixed(3)) : undefined,
  };
}
```

> **Implementation note for the worker:** `swisseph-wasm`'s exact method/return-field names (`julday`, `calc_ut`, `houses_ex`, `set_sid_mode`, `get_ayanamsa_ut`, and the shape of returned objects) must be confirmed against the installed version — open `node_modules/swisseph-wasm/` and its README/`index.d.ts`. The code above defensively reads several possible field shapes (`res.longitude ?? res.x?.[0] ?? res[0]`); adjust to the real shape and delete the fallbacks once confirmed. Replace the `require("./constants")` reconstruction with a top-level `import { SIGNS } from "./constants"` and `SIGNS.indexOf(rahu.sign)`. The **test is the source of truth** — the sidereal Sun must land in Sagittarius and ayanamsa ~23–24° for 1990; iterate on the binding until the two tests pass.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- chart`
Expected: PASS (2 tests). If the sidereal sign or ayanamsa is off, the flag wiring is wrong — fix before proceeding.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Add chart service: real Vedic + Western chart computation"
```

---

### Task 7: Birth-profile intake + chart caching

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/app/page.tsx`, `app/(app)/app/intake/page.tsx`
- Create: `app/(app)/app/intake/actions.ts`
- Create: `components/PlaceAutocomplete.tsx`, `components/IntakeForm.tsx`
- Create: `app/api/geocode/route.ts`
- Create: `lib/data/birthProfile.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (3), `geocodePlace` (5), `computeChart` (6).
- Produces: `getBirthProfile(userId)` and `saveBirthProfile(...)` data helpers; a `saveIntake` server action that validates input, computes both charts... actually computes on demand per conversation, so here it stores birth data + caches the **vedic and western** charts in `chart` JSONB as `{ vedic: Chart, western: Chart }`. `/api/geocode?q=` returns `GeoResult[]` for the autocomplete. After intake, `/app` shows a "Start a reading" entry point.

- [ ] **Step 1: Data helper**

`lib/data/birthProfile.ts`:
```ts
import { createServerSupabase } from "@/lib/supabase/server";
import { computeChart } from "@/lib/astrology/chart";
import type { BirthInput } from "@/lib/astrology/types";

export type BirthProfileRow = {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  birth_time: string;
  place_name: string;
  lat: number;
  lng: number;
  timezone: string;
  chart: { vedic: unknown; western: unknown } | null;
};

export async function getBirthProfile(): Promise<BirthProfileRow | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("birth_profiles").select("*").maybeSingle();
  return (data as BirthProfileRow) ?? null;
}

export async function saveBirthProfile(input: {
  userId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthTime: string;
  placeName: string;
  lat: number;
  lng: number;
  timezone: string;
}) {
  const supabase = await createServerSupabase();
  const birth: BirthInput = {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    lat: input.lat,
    lng: input.lng,
    timezone: input.timezone,
  };
  const [vedic, western] = await Promise.all([
    computeChart(birth, "vedic"),
    computeChart(birth, "western"),
  ]);
  const { error } = await supabase.from("birth_profiles").upsert(
    {
      user_id: input.userId,
      first_name: input.firstName,
      last_name: input.lastName,
      birth_date: input.birthDate,
      birth_time: input.birthTime,
      place_name: input.placeName,
      lat: input.lat,
      lng: input.lng,
      timezone: input.timezone,
      chart: { vedic, western },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Geocode API route**

`app/api/geocode/route.ts`:
```ts
import { NextResponse } from "next/server";
import { geocodePlace } from "@/lib/geo";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await geocodePlace(q);
  return NextResponse.json(results);
}
```

- [ ] **Step 3: Place autocomplete (client)**

`components/PlaceAutocomplete.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { GeoResult } from "@/lib/geo";

export function PlaceAutocomplete({ onPick }: { onPick: (r: GeoResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  async function search(value: string) {
    setQ(value);
    setPicked(null);
    if (value.trim().length < 2) return setResults([]);
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(value)}`);
    setResults(await res.json());
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Birthplace (city)"
        className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-accent"
      />
      {picked && <p className="mt-1 text-xs text-muted">Selected: {picked}</p>}
      {results.length > 0 && !picked && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-white/15 bg-bg">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button"
                onClick={() => { onPick(r); setPicked(r.name); setResults([]); setQ(r.name); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10">
                {r.name} <span className="text-muted">· {r.timezone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Intake form (client) + hidden geo fields**

`components/IntakeForm.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { GeoResult } from "@/lib/geo";
import { PlaceAutocomplete } from "./PlaceAutocomplete";

export function IntakeForm({ action }: { action: (fd: FormData) => void }) {
  const [geo, setGeo] = useState<GeoResult | null>(null);
  return (
    <form action={action} className="max-w-md space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="first_name" required placeholder="First name" className="rounded-md border border-white/15 bg-white/5 px-3 py-2" />
        <input name="last_name" required placeholder="Last name" className="rounded-md border border-white/15 bg-white/5 px-3 py-2" />
      </div>
      <label className="block text-sm text-muted">Birth date
        <input name="birth_date" type="date" required className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />
      </label>
      <label className="block text-sm text-muted">Birth time (as exact as you know)
        <input name="birth_time" type="time" required className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />
      </label>
      <PlaceAutocomplete onPick={setGeo} />
      <input type="hidden" name="place_name" value={geo?.name ?? ""} />
      <input type="hidden" name="lat" value={geo?.lat ?? ""} />
      <input type="hidden" name="lng" value={geo?.lng ?? ""} />
      <input type="hidden" name="timezone" value={geo?.timezone ?? ""} />
      <button disabled={!geo} className="w-full rounded-md bg-fg px-3 py-2 font-medium text-bg disabled:opacity-40">
        Save & build my chart
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Intake action**

`app/(app)/app/intake/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { saveBirthProfile } from "@/lib/data/birthProfile";

export async function saveIntake(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await saveBirthProfile({
    userId: user.id,
    firstName: String(formData.get("first_name")),
    lastName: String(formData.get("last_name")),
    birthDate: String(formData.get("birth_date")),
    birthTime: String(formData.get("birth_time")),
    placeName: String(formData.get("place_name")),
    lat: Number(formData.get("lat")),
    lng: Number(formData.get("lng")),
    timezone: String(formData.get("timezone")),
  });
  redirect("/app");
}
```

- [ ] **Step 6: App layout + pages**

`app/(app)/layout.tsx`:
```tsx
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link href="/app" className="text-xl font-bold tracking-tight">Astra</Link>
        <form action={signOut}><button className="text-sm text-muted">Sign out</button></form>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
```

`app/(app)/app/page.tsx`:
```tsx
import Link from "next/link";
import { getBirthProfile } from "@/lib/data/birthProfile";

export default async function AppHome() {
  const profile = await getBirthProfile();
  if (!profile) {
    return (
      <div className="max-w-md">
        <h1 className="mb-2 text-3xl font-bold">Let's build your chart</h1>
        <p className="mb-6 text-muted">We compute your real birth chart from your date, time, and place.</p>
        <Link href="/app/intake" className="rounded-md bg-fg px-4 py-2 font-medium text-bg">Enter birth details</Link>
      </div>
    );
  }
  return (
    <div className="max-w-md">
      <h1 className="mb-2 text-3xl font-bold">Hello, {profile.first_name}</h1>
      <p className="mb-6 text-muted">Your chart is ready. Ask about your future, a kundli reading, or life advice.</p>
      <Link href="/app/chat" className="rounded-md bg-accent px-4 py-2 font-medium text-bg">Start a reading</Link>
    </div>
  );
}
```

`app/(app)/app/intake/page.tsx`:
```tsx
import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "./actions";

export default function IntakePage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Your birth details</h1>
      <IntakeForm action={saveIntake} />
    </div>
  );
}
```

- [ ] **Step 7: Manual verification**

Run `npm run dev`, log in, go to `/app` → intake → fill the form (birthplace autocomplete should populate). Submit → redirected to `/app` showing "Start a reading". In Supabase, confirm the `birth_profiles` row has a populated `chart` JSONB with `vedic` and `western` keys.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Add birth-profile intake, geocode autocomplete, and chart caching"
```

---

### Task 8: Prompt builder

**Files:**
- Create: `lib/astrology/prompt.ts`
- Test: `lib/astrology/prompt.test.ts`

**Interfaces:**
- Consumes: `Chart`, `Tradition` types (6).
- Produces: `buildSystemPrompt(args: { firstName: string; tradition: Tradition; chart: Chart }): string` — a deterministic system prompt embedding the computed chart as structured context, instructing Claude to interpret (never invent) positions, adopt an astrologer voice, and include the guidance disclaimer. Used by Task 9.

- [ ] **Step 1: Write the failing test**

`lib/astrology/prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt";
import type { Chart } from "./types";

const chart: Chart = {
  tradition: "vedic",
  ascendant: { sign: "Leo", degree: 12.3 },
  houses: Array.from({ length: 12 }, (_, i) => i * 30),
  planets: [
    { name: "Sun", sign: "Sagittarius", degree: 16.5, house: 5, retrograde: false, nakshatra: "Purva Ashadha" },
    { name: "Moon", sign: "Taurus", degree: 3.1, house: 10, retrograde: false, nakshatra: "Krittika" },
  ],
  moonSign: "Taurus",
  sunSign: "Sagittarius",
  ayanamsa: 23.7,
};

describe("buildSystemPrompt", () => {
  it("embeds the tradition, name, ascendant, and planetary data", () => {
    const p = buildSystemPrompt({ firstName: "Aditi", tradition: "vedic", chart });
    expect(p).toContain("Aditi");
    expect(p).toContain("Vedic");
    expect(p).toContain("Leo"); // ascendant
    expect(p).toContain("Sagittarius"); // sun sign
    expect(p).toContain("Purva Ashadha"); // nakshatra
  });

  it("instructs the model not to invent positions and to include a disclaimer", () => {
    const p = buildSystemPrompt({ firstName: "Aditi", tradition: "vedic", chart });
    expect(p.toLowerCase()).toContain("do not invent");
    expect(p.toLowerCase()).toContain("guidance");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- prompt`
Expected: FAIL — `buildSystemPrompt` not implemented.

- [ ] **Step 3: Implement `lib/astrology/prompt.ts`**

```ts
import type { Chart, Tradition } from "./types";

function renderChart(chart: Chart): string {
  const lines: string[] = [];
  lines.push(`Ascendant (Lagna/Rising): ${chart.ascendant.sign} ${chart.ascendant.degree}°`);
  lines.push(`Sun sign: ${chart.sunSign} | Moon sign: ${chart.moonSign}`);
  if (chart.ayanamsa) lines.push(`Ayanamsa (Lahiri): ${chart.ayanamsa}°`);
  lines.push("Planets:");
  for (const p of chart.planets) {
    const nak = p.nakshatra ? `, nakshatra ${p.nakshatra}` : "";
    const retro = p.retrograde ? " (retrograde)" : "";
    lines.push(`  - ${p.name}: ${p.sign} ${p.degree}°, house ${p.house}${nak}${retro}`);
  }
  return lines.join("\n");
}

export function buildSystemPrompt(args: { firstName: string; tradition: Tradition; chart: Chart }): string {
  const system = args.tradition === "vedic" ? "Vedic (sidereal, Lahiri ayanamsa)" : "Western (tropical)";
  return `You are Astra, a warm, insightful ${system} astrologer speaking with ${args.firstName}.

You have been given ${args.firstName}'s REAL birth chart, computed from their exact birth date, time, and place using the Swiss Ephemeris. Interpret THIS chart. Do not invent, guess, or alter any planetary position, sign, house, or nakshatra — only the data below is real; everything else is your interpretation of it.

Their ${system} chart:
${renderChart(args.chart)}

How to respond:
- Ground every claim in specific placements from the chart above (name the planet, sign, house, and — for Vedic — nakshatra).
- Answer the person's actual question (future, career, relationships, a kundli reading, or general advice). Be specific and human, not generic.
- Use the traditional techniques of ${system} astrology: houses, aspects, ${args.tradition === "vedic" ? "yogas, doshas, and dasha periods" : "aspects and transits"}.
- Keep readings focused and readable. Lead with the insight, then the reasoning from the chart.
- Never make medical, legal, or financial guarantees.

Always keep in mind this is for guidance and reflection, and gently remind the user when appropriate that astrology is a tool for perspective, not a substitute for professional advice.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- prompt`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add chart-grounded prompt builder"
```

---

### Task 9: Streaming chat API route + persistence

**Files:**
- Create: `lib/anthropic.ts`
- Create: `lib/data/chat.ts`
- Create: `app/api/chat/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (3), `buildSystemPrompt` (8), birth-profile `chart` (7), `@anthropic-ai/sdk`.
- Produces: `POST /api/chat` accepting `{ conversationId?: string; tradition: Tradition; message: string; deep?: boolean }`. It: authenticates the user, loads their cached chart, creates the conversation if needed, persists the user message, streams Claude's reply as a `text/plain` stream, and persists the assistant message when the stream ends. Returns header `x-conversation-id`. `lib/data/chat.ts` exposes `getOrCreateConversation`, `appendMessage`, `getMessages`, `listConversations`.

- [ ] **Step 1: Anthropic client**

`lib/anthropic.ts`:
```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

export const READING_MODEL = "claude-sonnet-5";
export const DEEP_READING_MODEL = "claude-opus-4-8";

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}
```

- [ ] **Step 2: Chat data helpers**

`lib/data/chat.ts`:
```ts
import { createServerSupabase } from "@/lib/supabase/server";
import type { Tradition } from "@/lib/astrology/types";

export async function getOrCreateConversation(args: {
  userId: string;
  conversationId?: string;
  tradition: Tradition;
  title: string;
}): Promise<string> {
  const supabase = await createServerSupabase();
  if (args.conversationId) return args.conversationId;
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: args.userId, tradition: args.tradition, title: args.title.slice(0, 80) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function appendMessage(conversationId: string, role: "user" | "assistant", content: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, role, content });
  if (error) throw new Error(error.message);
}

export async function getMessages(conversationId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listConversations() {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("conversations")
    .select("id, tradition, title, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}
```

- [ ] **Step 3: The streaming route**

`app/api/chat/route.ts`:
```ts
import { createServerSupabase } from "@/lib/supabase/server";
import { anthropic, READING_MODEL, DEEP_READING_MODEL } from "@/lib/anthropic";
import { buildSystemPrompt } from "@/lib/astrology/prompt";
import type { Chart, Tradition } from "@/lib/astrology/types";
import { getOrCreateConversation, appendMessage, getMessages } from "@/lib/data/chat";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json()) as {
    conversationId?: string;
    tradition: Tradition;
    message: string;
    deep?: boolean;
  };
  if (!body.message?.trim()) return new Response("Empty message", { status: 400 });

  const { data: profile } = await supabase
    .from("birth_profiles")
    .select("first_name, chart")
    .maybeSingle();
  if (!profile?.chart) return new Response("No chart. Complete intake first.", { status: 400 });

  const chart = (profile.chart as { vedic: Chart; western: Chart })[body.tradition];
  const system = buildSystemPrompt({ firstName: profile.first_name, tradition: body.tradition, chart });

  const conversationId = await getOrCreateConversation({
    userId: user.id,
    conversationId: body.conversationId,
    tradition: body.tradition,
    title: body.message,
  });

  // Build history from persisted messages, then append the new user turn.
  const history = await getMessages(conversationId);
  const messages = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  messages.push({ role: "user", content: body.message });
  await appendMessage(conversationId, "user", body.message);

  const model = body.deep ? DEEP_READING_MODEL : READING_MODEL;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        const s = anthropic().messages.stream({
          model,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system,
          messages,
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode("\n\n[The stars are momentarily clouded — please try again.]"));
        full ||= "";
      } finally {
        if (full.trim()) await appendMessage(conversationId, "assistant", full);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-conversation-id": conversationId,
      "cache-control": "no-store",
    },
  });
}
```

- [ ] **Step 4: Manual verification (after Task 10 UI, or via curl)**

With the dev server running and logged-in cookies, a `POST /api/chat` with a body streams text back and inserts a `conversations` row + two `messages` rows. Full verification happens in Task 10.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add streaming chat API route with chart-grounded prompt and persistence"
```

---

### Task 10: Chat UI (streaming, tradition selector, history)

**Files:**
- Create: `app/(app)/app/chat/page.tsx`
- Create: `components/Chat.tsx`

**Interfaces:**
- Consumes: `/api/chat` (9), `listConversations`/`getMessages` (9).
- Produces: a chat screen with a Vedic/Western selector, a deep-reading toggle, streaming assistant responses, and the disclaimer. Reads/streams via `fetch` with a `ReadableStream` reader.

- [ ] **Step 1: Chat client component**

`components/Chat.tsx`:
```tsx
"use client";
import { useRef, useState } from "react";
import type { Tradition } from "@/lib/astrology/types";

type Msg = { role: "user" | "assistant"; content: string };

export function Chat({ initialConversationId }: { initialConversationId?: string }) {
  const [tradition, setTradition] = useState<Tradition>("vedic");
  const [deep, setDeep] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const convId = useRef<string | undefined>(initialConversationId);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: convId.current, tradition, message: text, deep }),
    });
    convId.current = res.headers.get("x-conversation-id") ?? convId.current;

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk };
        return copy;
      });
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <select value={tradition} onChange={(e) => setTradition(e.target.value as Tradition)}
          className="rounded-md border border-white/15 bg-white/5 px-2 py-1">
          <option value="vedic">Vedic (kundli)</option>
          <option value="western">Western</option>
        </select>
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> Deep reading
        </label>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-md border border-white/10 p-4">
        {messages.length === 0 && (
          <p className="text-muted">Ask about your future, a kundli reading, or advice.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === "user" ? "bg-fg text-bg" : "bg-white/5"}`}>
              {m.content || "…"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask Astra…"
          className="flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-accent" />
        <button onClick={send} disabled={busy}
          className="rounded-md bg-accent px-4 py-2 font-medium text-bg disabled:opacity-40">Send</button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        For guidance and reflection. Not a substitute for professional advice.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Chat page (guards on chart existing)**

`app/(app)/app/chat/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getBirthProfile } from "@/lib/data/birthProfile";
import { Chat } from "@/components/Chat";

export default async function ChatPage() {
  const profile = await getBirthProfile();
  if (!profile?.chart) redirect("/app/intake");
  return <Chat />;
}
```

- [ ] **Step 3: Manual verification (end-to-end)**

Run `npm run dev`, log in with a chart present, open `/app/chat`. Ask "What does my kundli say about my career?" → tokens stream in. Toggle Western → ask again. In Supabase, confirm one `conversations` row and alternating `user`/`assistant` `messages` rows with the streamed content saved.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Add streaming chat UI with tradition selector and deep-reading toggle"
```

---

### Task 11: Admin auth (separate, isolated login)

**Files:**
- Create: `app/admin/login/page.tsx`
- Create: `app/admin/actions.ts`
- Create: `lib/admin/guard.ts`
- Modify: `lib/supabase/middleware.ts` (add `/admin` protection, excluding `/admin/login`)

**Interfaces:**
- Consumes: `createServerSupabase` (3), `createAdminSupabase` (3), `admins` table (2).
- Produces: `requireAdmin()` — server helper that returns the admin user or redirects to `/admin/login`; a dedicated admin login action `adminSignIn` that authenticates via Supabase then verifies the user is in `admins` (rejecting non-admins even with valid consumer credentials). `signOut` reused from consumer actions.

- [ ] **Step 1: Admin guard**

`lib/admin/guard.ts`:
```ts
import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function isAdminUser(userId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

export async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  if (!(await isAdminUser(user.id))) redirect("/admin/login?error=Not+authorized");
  return user;
}
```

- [ ] **Step 2: Admin login action**

`app/admin/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin/guard";

export async function adminSignIn(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error || !data.user) return redirect(`/admin/login?error=${encodeURIComponent(error?.message ?? "Login failed")}`);
  if (!(await isAdminUser(data.user.id))) {
    await supabase.auth.signOut();
    return redirect("/admin/login?error=Not+authorized");
  }
  redirect("/admin");
}
```

- [ ] **Step 3: Admin login page**

`app/admin/login/page.tsx`:
```tsx
import { adminSignIn } from "../actions";

export default async function AdminLogin({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form action={adminSignIn} className="w-full max-w-sm space-y-3">
        <h1 className="text-3xl font-bold">Astra Admin</h1>
        {sp.error && <p className="text-sm text-accent">{sp.error}</p>}
        <input name="email" type="email" required placeholder="admin email"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />
        <input name="password" type="password" required placeholder="password"
          className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />
        <button className="w-full rounded-md bg-fg px-3 py-2 font-medium text-bg">Enter</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Extend middleware to guard `/admin`**

In `lib/supabase/middleware.ts`, replace the protection block with:
```ts
  const path = request.nextUrl.pathname;
  const isProtectedApp = path.startsWith("/app");
  const isProtectedAdmin = path.startsWith("/admin") && path !== "/admin/login";
  if ((isProtectedApp || isProtectedAdmin) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = isProtectedAdmin ? "/admin/login" : "/login";
    return NextResponse.redirect(url);
  }
```
(The fine-grained admin membership check happens in `requireAdmin()`; middleware only enforces "must be logged in" to keep the service-role lookup out of the edge path.)

- [ ] **Step 5: Manual verification**

Log in at `/admin/login` with a non-admin account → rejected ("Not authorized"). Add your user to `admins` (see `docs/SUPABASE_SETUP.md` step 5), log in again → reach `/admin` (404 until Task 12 — expected).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add isolated admin login and server-side admin guard"
```

---

### Task 12: Admin dashboard (read all users' chats)

**Files:**
- Create: `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/conversations/[id]/page.tsx`
- Create: `lib/admin/data.ts`

**Interfaces:**
- Consumes: `requireAdmin` (11), `createAdminSupabase` (3).
- Produces: `adminListUsers()` (users + conversation counts), `adminListConversations(userId?)`, `adminGetTranscript(conversationId)` — all via the service-role client (bypasses RLS) and only reachable behind `requireAdmin()`. Read-only dashboard listing users → their conversations → full transcript.

- [ ] **Step 1: Admin data access**

`lib/admin/data.ts`:
```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function adminListUsers() {
  const db = createAdminSupabase();
  const { data: profiles } = await db.from("profiles").select("id, display_name, created_at");
  const { data: convs } = await db.from("conversations").select("id, user_id");
  const counts = new Map<string, number>();
  for (const c of convs ?? []) counts.set(c.user_id, (counts.get(c.user_id) ?? 0) + 1);
  return (profiles ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name ?? "(unnamed)",
    createdAt: p.created_at,
    conversationCount: counts.get(p.id) ?? 0,
  }));
}

export async function adminListConversations(userId: string) {
  const db = createAdminSupabase();
  const { data } = await db
    .from("conversations")
    .select("id, tradition, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function adminGetTranscript(conversationId: string) {
  const db = createAdminSupabase();
  const { data: conv } = await db
    .from("conversations")
    .select("id, user_id, tradition, title, created_at")
    .eq("id", conversationId)
    .single();
  const { data: messages } = await db
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return { conv, messages: messages ?? [] };
}
```

- [ ] **Step 2: Admin layout (guarded)**

`app/admin/layout.tsx`:
```tsx
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link href="/admin" className="text-xl font-bold">Astra Admin</Link>
        <form action={signOut}><button className="text-sm text-muted">Sign out</button></form>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
```
> Note: `/admin/login` uses its own full-page markup and renders inside this layout too; that's fine (it shows the header only when already authed via middleware — the login page itself is reachable while logged out because middleware excludes it). If the header on the login page is undesirable, move `login/` out by rendering a bare page; optional.

- [ ] **Step 3: Users list**

`app/admin/page.tsx`:
```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminListUsers } from "@/lib/admin/data";

export default async function AdminHome() {
  await requireAdmin();
  const users = await adminListUsers();
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Users</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr><th className="py-2">Name</th><th>Joined</th><th>Chats</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-white/10">
              <td className="py-2">{u.displayName}</td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>{u.conversationCount}</td>
              <td><Link className="text-accent" href={`/admin/users/${u.id}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: User's conversations + transcript pages**

`app/admin/users/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminListConversations } from "@/lib/admin/data";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const convs = await adminListConversations(id);
  return (
    <div>
      <Link href="/admin" className="text-sm text-muted">← Users</Link>
      <h1 className="my-4 text-2xl font-bold">Conversations</h1>
      <ul className="space-y-2">
        {convs.map((c) => (
          <li key={c.id} className="border-t border-white/10 py-2">
            <Link className="text-accent" href={`/admin/conversations/${c.id}`}>
              [{c.tradition}] {c.title ?? "(untitled)"}
            </Link>
            <span className="ml-2 text-xs text-muted">{new Date(c.created_at).toLocaleString()}</span>
          </li>
        ))}
        {convs.length === 0 && <p className="text-muted">No conversations.</p>}
      </ul>
    </div>
  );
}
```

`app/admin/conversations/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminGetTranscript } from "@/lib/admin/data";

export default async function AdminTranscript({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { conv, messages } = await adminGetTranscript(id);
  return (
    <div className="mx-auto max-w-2xl">
      {conv && <Link href={`/admin/users/${conv.user_id}`} className="text-sm text-muted">← Conversations</Link>}
      <h1 className="my-4 text-2xl font-bold">{conv?.title ?? "Transcript"}</h1>
      <div className="space-y-4">
        {messages.map((m, i) => (
          <div key={i}>
            <div className="text-xs uppercase text-muted">{m.role}</div>
            <div className="whitespace-pre-wrap rounded-md bg-white/5 p-3">{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```
> The user-detail route lives at `app/admin/users/[id]/page.tsx` — create that directory (referenced by the users list link).

- [ ] **Step 5: Manual verification (isolation)**

As an admin, `/admin` lists users and every transcript is readable. Log in as a **non-admin** consumer and directly visit `/admin` → redirected to `/admin/login?error=Not+authorized`. Confirm a consumer cannot read another user's `messages` via the normal client (RLS): from the consumer app there is no route to others' data.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add admin dashboard: users, conversations, read-only transcripts"
```

---

### Task 13: Marketing landing (cosmic Astra style)

**Files:**
- Replace: `app/page.tsx`
- Create: `app/(marketing)/layout.tsx` (optional wrapper) — or keep it in `app/page.tsx`
- Create: `components/marketing/Hero.tsx`, `components/marketing/HowItWorks.tsx`, `components/marketing/CTA.tsx`

**Interfaces:**
- Consumes: hero images in `public/images/` (1); auth routes (4).
- Produces: a three-section landing — Hero (starfield/planet imagery + huge bold type), "How it works / the science" (the real-chart engine explained + big stat numbers in the Astra editorial style), and a sign-up CTA. Redirects logged-in users to `/app`.

> Before building the visual layer, the implementer should invoke the `frontend-design` skill to hit the monochrome-cosmic "Astra" aesthetic from the reference screenshots (huge bold type, black/white with a single warm accent, editorial spacing, big stat numbers).

- [ ] **Step 1: Hero**

`components/marketing/Hero.tsx`:
```tsx
import Image from "next/image";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative flex min-h-[90vh] items-center overflow-hidden">
      <Image src="/images/planet-sun.jpg" alt="" fill priority className="object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
      <div className="relative z-10 px-6 md:px-16">
        <p className="mb-4 text-sm uppercase tracking-widest text-muted">Astrology, computed — not guessed</p>
        <h1 className="max-w-3xl text-6xl font-bold leading-[0.95] tracking-tight md:text-8xl">
          Your chart,<br />read by the stars.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Enter your birth date, time, and place. We compute your real Vedic or Western birth chart and let you
          ask it anything — your future, a kundli reading, or life advice.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/signup" className="rounded-md bg-fg px-6 py-3 font-medium text-bg">Get your reading</Link>
          <Link href="/login" className="rounded-md border border-white/25 px-6 py-3">Log in</Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: How it works / the science**

`components/marketing/HowItWorks.tsx`:
```tsx
import Image from "next/image";

export function HowItWorks() {
  return (
    <section className="relative px-6 py-24 md:px-16">
      <h2 className="text-5xl font-bold tracking-tight md:text-7xl">The science<br />under the stars.</h2>
      <div className="mt-12 grid gap-10 md:grid-cols-3">
        <Stat n="9" unit="bodies" label="Sun through Ketu, with exact sign, house, degree, and retrograde state." />
        <Stat n="27" unit="nakshatras" label="Full Vedic lunar mansions, plus Lahiri ayanamsa and dasha context." />
        <Stat n="2" unit="systems" label="Switch between Vedic (sidereal) and Western (tropical) on any question." />
      </div>
      <div className="mt-12 max-w-2xl text-muted">
        <p>
          Astra computes your chart with the Swiss Ephemeris — the same astronomical engine professional
          astrologers rely on. Your birth time is converted to the exact moment in the sky over your birthplace,
          then interpreted, placement by placement, so every reading is grounded in a real chart rather than a guess.
        </p>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 -z-10 h-full w-1/2 opacity-30">
        <Image src="/images/starfield.jpg" alt="" fill className="object-cover" />
      </div>
    </section>
  );
}

function Stat({ n, unit, label }: { n: string; unit: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-7xl font-bold">{n}</span>
        <span className="text-xl text-muted">{unit}</span>
      </div>
      <p className="mt-2 text-sm text-muted">{label}</p>
    </div>
  );
}
```

- [ ] **Step 3: CTA**

`components/marketing/CTA.tsx`:
```tsx
import Link from "next/link";
import Image from "next/image";

export function CTA() {
  return (
    <section className="relative overflow-hidden px-6 py-32 text-center md:px-16">
      <Image src="/images/starfield.jpg" alt="" fill className="object-cover opacity-50" />
      <div className="relative z-10">
        <h2 className="mx-auto max-w-2xl text-5xl font-bold tracking-tight md:text-7xl">
          Ask the sky your first question.
        </h2>
        <Link href="/signup" className="mt-8 inline-block rounded-md bg-accent px-8 py-3 font-medium text-bg">
          Create your free account
        </Link>
        <p className="mt-6 text-xs text-muted">For guidance and reflection. Not a substitute for professional advice.</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Compose the landing page**

`app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { CTA } from "@/components/marketing/CTA";

export default async function Landing() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/app");
  return (
    <>
      <Hero />
      <HowItWorks />
      <CTA />
    </>
  );
}
```

- [ ] **Step 5: Verification**

Run `npm run dev`, open `/` while logged out → three cosmic sections render with the hero photos; CTA and hero link to `/signup`. `npm run build` succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add cosmic Astra marketing landing (hero, science, CTA)"
```

---

### Task 14: Deploy to Vercel

**Files:**
- Create: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: the whole app; Supabase project (2); Anthropic key.
- Produces: a live Vercel deployment with the four env vars set, and documented steps.

- [ ] **Step 1: Write deploy doc**

`docs/DEPLOY.md`:
```markdown
# Deploying Astra to Vercel

1. Push the repo to GitHub (or use `vercel` CLI with a local project).
2. `npm i -g vercel` then `vercel login`.
3. From the project root: `vercel link` (create a new project named "astra").
4. Add env vars (Production + Preview):
   - `vercel env add NEXT_PUBLIC_SUPABASE_URL`
   - `vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `vercel env add SUPABASE_SERVICE_ROLE_KEY`
   - `vercel env add ANTHROPIC_API_KEY`
5. In Supabase → Authentication → URL Configuration, add the Vercel domain to
   Site URL and Redirect URLs (`https://<app>.vercel.app/auth/callback`).
6. `vercel --prod`.
7. Smoke test on the live URL: signup → intake → chat streams → `/admin/login`.

Secrets are stored encrypted by Vercel and never committed. `.env.local` stays local and gitignored.
```

- [ ] **Step 2: Pre-deploy build gate**

Run: `cd /Users/shivvyas/astra && npm run test && npm run build`
Expected: all tests pass; production build succeeds.

- [ ] **Step 3: Deploy**

Run the steps in `docs/DEPLOY.md` (interactive `vercel login` / `vercel --prod`). If running inside this session, suggest the user run `! vercel login` first. Verify the live smoke test.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Add Vercel deploy guide"
```

---

## Notes for the implementer

- **`swisseph-wasm` binding is the one true unknown.** Task 6's code defensively handles multiple return shapes; confirm the real API against the installed package and make the two chart tests pass before building anything above it. If the package proves unworkable on the Node serverless runtime, the fallback is a hosted ephemeris API called from `computeChart` (keep the same `Chart` return type so nothing downstream changes).
- **Model IDs are fixed:** `claude-sonnet-5` (default) and `claude-opus-4-8` (deep). Do not substitute.
- **Secrets discipline:** `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` appear only in `lib/supabase/admin.ts`, `lib/admin/*`, and `lib/anthropic.ts` — all `import "server-only"`. Never reference them from a `"use client"` file.
- **RLS is the primary defense** for consumer data; the admin dashboard's service-role client is the *only* code that bypasses it, and it sits entirely behind `requireAdmin()`.
