# Astra — Astrology Prediction Web App — Design Spec

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation plan

## Summary

Astra is a consumer web app where users sign up, enter their birth details, and
chat with a Claude-powered astrologer that interprets their **real computed birth
chart**. Users choose Vedic (kundli) or Western per session. All chats are stored
in Supabase. A **separate, isolated admin** can read every user's chat transcripts.

The visual language is the cosmic monochrome "Astra" style (black/white, large bold
type, editorial layout) using the user-provided starfield and planet photos as hero
imagery.

## Goals

- A polished 3-section cosmic marketing site (Hero, How it works / the science, CTA).
- Consumer auth: email/password + magic link (Supabase Auth).
- Birth-profile intake: first name, last name, birth date, birth time, birthplace.
- **Accurate** astrology: compute the real astronomical chart, then have Claude interpret it.
- Support **both** traditions — Vedic (sidereal/Lahiri) and Western (tropical) — user picks per session.
- Streaming conversational chat; full history persisted.
- Separate admin app to read all users' chats (read-only).
- Continuous deployment to Vercel; all secrets kept out of git.

## Non-Goals (v1)

- Payments/subscriptions (Opus "deep reading" tier is a config toggle, not billing).
- Native mobile apps.
- Push notifications / email digests.
- Social features, sharing, public profiles.

## Architecture & Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS.** One app, three route zones:
  - `(marketing)` — public landing.
  - `(app)` — authenticated consumer app (intake, chat).
  - `admin` — isolated admin app with its own login.
- **Supabase** — Postgres + Auth + Row-Level Security (RLS). Consumer auth via Supabase.
- **Anthropic SDK (`@anthropic-ai/sdk`)** — streaming Claude responses.
  - Default reading model: **Sonnet 5** (`claude-sonnet-5`).
  - Optional deep reading: **Opus 4.8** (`claude-opus-4-8`), config toggle.
- **Astrology compute:** **Swiss Ephemeris (WASM)** server-side (Vercel-compatible).
  Produces tropical (Western) and sidereal/Lahiri (Vedic) charts from one birth input.
- **Geocoding + timezone:** birthplace autocomplete via Open-Meteo geocoding (free, no
  key) → lat/lng; offline timezone lookup (`tz-lookup`) + `luxon` for historical DST,
  so birth time is converted to correct UT for the ephemeris.
- **Deployment:** Vercel (continuous). Secrets in gitignored `.env.local` locally and
  Vercel encrypted env vars in cloud. `.env.example` documents required keys.

## The Prediction Engine (accuracy core)

From birth **date + time + place**, the chart service computes and caches the real chart,
then hands a structured summary to Claude for interpretation. Claude never guesses
planetary positions — it interprets computed values.

Computed fields:
- **Ascendant (Lagna / Rising sign)** and all **12 house cusps**.
- **Planetary positions** Sun → Ketu (sidereal Lahiri for Vedic; tropical for Western),
  with sign, house, degree, retrograde flag.
- **Nakshatra + pada**, **Rashi (moon sign)** — Vedic.
- **Vimshottari Dasha** timeline (current mahadasha/antardasha) — Vedic.
- **Aspects** (major) and support for **transits** — Western.
- Notable **yogas / doshas** (e.g. Mangal dosha) — Vedic.

## Components (each independently testable)

1. **Marketing site** — Hero (starfield/planet photos + bold type), "How it works / the
   science" section, Sign-up CTA. Cosmic monochrome Astra aesthetic.
2. **Consumer auth** — signup/login via Supabase (email+password, magic link); session
   middleware protecting `(app)` routes.
3. **Birth-profile intake** — form (first name, last name, birth date, birth time,
   birthplace autocomplete → lat/lng/tz). Saved per user; chart computed once and cached.
   Manual lat/lng fallback if geocoding fails.
4. **Chart service** — pure module: birth data → structured chart JSON (both traditions).
   Deterministic; unit-tested against known birth data.
5. **Chat** — streaming conversational readings. Tradition selector (Vedic/Western) per
   session. Loads chart + history, builds prompt, streams Claude, persists messages.
6. **Admin app** — separate `/admin/login`; isolated route group. Read-only dashboard:
   list users, open any conversation transcript. Server-side privileged data access.

## Data Model (Supabase Postgres)

- `profiles` — one per auth user (display name, created_at).
- `birth_profiles` — user_id (FK), first_name, last_name, birth_date, birth_time,
  place_name, lat, lng, timezone, computed `chart` JSONB (cached), updated_at.
- `conversations` — id, user_id (FK), tradition ('vedic' | 'western'), title, created_at.
- `messages` — id, conversation_id (FK), role ('user' | 'assistant'), content, created_at.
- `admins` — separate admin identities (isolated from consumer auth path).

**RLS policies:**
- Users can read/write only rows where `user_id = auth.uid()`.
- Consumer signup can never grant admin (no self-service path to `admins`).
- Admin app reads all data through a server-side privileged (service-role) client,
  gated by admin authentication in the isolated `/admin` zone.

## Key Flows

1. **Onboard:** signup → create `profiles` row → intake birth data → chart computed &
   cached in `birth_profiles.chart`.
2. **Chat:** open chat → pick tradition → send question → server loads chart + history →
   build system/context prompt → **Claude streams** reading → persist user + assistant
   messages.
3. **Admin:** admin logs in at `/admin/login` (separate) → user list → open transcript
   (read-only).

## Error Handling & Safety

- Geocoding failure → manual lat/lng entry fallback.
- Ephemeris / Claude API errors → graceful retry + clear user-facing message; streaming
  fallback to non-streamed response if needed.
- Disclaimer on readings ("for guidance / entertainment").
- All secrets server-side only; service-role key never reaches the browser.

## Testing Strategy

- **Unit:** chart service (known birth data → expected positions/houses/nakshatra);
  prompt builder output shape.
- **Integration:** auth + RLS (a user cannot read another user's rows; a non-admin
  cannot reach `/admin` or admin data).
- **E2E smoke:** signup → intake → chat → message persisted.

## Deployment & Secrets

- Local: `.env.local` (gitignored). `.env.example` lists: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.
- Cloud: Vercel project, same vars as encrypted env vars. Continuous deploy from git.
- User will authenticate Supabase and Vercel CLIs interactively when needed.

## Open Implementation Choices (defaults, may adjust during planning)

- Swiss Ephemeris WASM package selection verified during implementation for
  serverless compatibility (fallback: hosted ephemeris API).
- Exact Tailwind design tokens finalized during frontend-design pass.
