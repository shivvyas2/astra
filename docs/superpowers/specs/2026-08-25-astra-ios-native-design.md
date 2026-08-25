# Astra — Native iOS App — Design Spec

**Date:** 2026-08-25
**Status:** Approved (design), pending implementation plan
**Supersedes:** the "Native mobile apps" non-goal in `2026-07-23-astra-design.md`

## Summary

A **pure native SwiftUI iOS app** for Astra, distributed on the App Store. It
reproduces the existing cosmic monochrome look faithfully in native UI, and uses
the current Vercel deployment as its backend. No WebView, no Capacitor, no
embedded web content.

The existing Next.js web app is **unchanged and stays live**. It keeps the
marketing landing page, the GSAP scroll sections, the web app, and the admin
zone. iOS becomes a second client against the same Supabase database and the
same API routes.

## Why native is tractable here

An audit of the current UI removed the assumed obstacles:

- **`three` is a dead dependency.** Nothing imports it. The comment in
  `components/marketing/CosmicLanding.tsx:4` is stale; the hero is a JPEG
  background plus CSS. There is no WebGL to port.
- **GSAP appears in exactly one file**, `components/marketing/CosmicHero.tsx`,
  which is the marketing landing page. It is out of scope for the app.
- **The design system is four tokens and the system font** (`app/globals.css`).
  No custom typefaces, no complex CSS.
- **Chat streams plain UTF-8 text chunks**, not SSE (`app/api/chat/route.ts`),
  with the conversation id returned in an `x-conversation-id` header. This maps
  directly onto `URLSession.bytes(for:)`.
- **RLS is owner-only `for all`** on `profiles`, `birth_profiles`,
  `conversations`, and `messages` (`supabase/migrations/0001_init.sql:75-90`),
  so the app can read and write its own rows directly with the anon key plus the
  user's JWT.

## Goals

- A native SwiftUI app covering the full authenticated Astra experience.
- Visual fidelity to the existing theme — same palette, type scale, and motion.
- Reuse the existing backend: no second implementation of the astrology engine.
- Native affordances that a web page cannot offer: wheel date/time pickers,
  Keychain, share sheet, haptics, push, and biometric lock.
- Ship to the App Store, satisfying Apple's review guidelines.

## Non-Goals (v1)

- Android, iPad-optimised layouts, and macOS.
- Replacing or retiring the web app.
- The admin zone — it stays web-only.
- Payments and subscriptions.
- On-device chart computation.
- Offline chat. (Offline *viewing* of a cached chart and past readings is in scope.)

## Architecture

Three participants:

1. **The iOS app (SwiftUI).** Owns all presentation and navigation.
2. **Supabase, reached directly via `supabase-swift`.** Auth, plus reads and
   writes of the user's own rows under existing RLS. Session persisted in the
   Keychain.
3. **The Vercel deployment.** Retains everything that cannot ship in a client
   binary: the `ANTHROPIC_API_KEY`, the `swisseph-wasm` ephemeris, and
   `pdf-lib` kundli generation.

The split follows a single rule: **anything requiring a secret or the ephemeris
stays on Vercel; everything else the app does itself.**

### Backend changes required

The existing routes authenticate by cookie only — `app/api/chat/route.ts:14`
calls `createServerSupabase()` and reads the session from request cookies. A
native client sends a bearer token instead.

- **Add bearer-token auth alongside cookie auth.** A shared helper resolves the
  caller from an `Authorization: Bearer <access_token>` header when present, and
  falls back to cookies otherwise. Applied to `/api/chat`, `/api/kundli`, and
  `/api/geocode`. The web app's behaviour is unchanged.
- **Add `POST /api/profile`.** The intake path is currently a server action
  (`app/(app)/app/intake/actions.ts`), which a native client cannot invoke. This
  route performs the same work: optional avatar upload to the `avatars` bucket
  via the service-role client, then `saveBirthProfile`, which computes and
  persists the chart.
- **Add `DELETE /api/account`.** Required by Apple (see Compliance). Calls
  `supabase.auth.admin.deleteUser` with the service-role client; the existing
  `on delete cascade` from `auth.users` removes profiles, birth profiles,
  conversations, and messages.
- **Add `/.well-known/apple-app-site-association`** to `public/`, served as
  `application/json`, for Universal Links.

No changes to the astrology engine, the prompt builder, the data model, or RLS.

## Design system translation

`app/globals.css` maps to a single `Theme.swift`:

| Web token | Value | SwiftUI |
|---|---|---|
| `--bg` | `#0a0a0b` | `Color.astraBg` |
| `--fg` | `#f4f1ea` | `Color.astraFg` |
| `--muted` | `#9a978f` | `Color.astraMuted` |
| `--accent` | `#e8663d` | `Color.astraAccent` |
| `--font-display` | system sans | `.system(design: .default)` |

Recurring surface treatments become view modifiers: the `border-white/10`
hairline, the `bg-white/[0.04]` field fill, the `rounded-lg` radius (8pt), and
the `uppercase tracking-[0.3em]` eyebrow style.

The six keyframe animations map to SwiftUI equivalents: `fade-up` and `fade-in`
to `.transition` with the same `cubic-bezier(0.22, 1, 0.36, 1)` timing curve;
`glow-pulse`, `heartbeat`, and `shimmer` to `.repeatForever` animations; the
blinking `.caret` to a `.opacity` phase animation during streaming.

`prefers-reduced-motion` maps to `@Environment(\.accessibilityReduceMotion)`,
preserving the existing reduced-motion behaviour.

## Screens

Five, mirroring the current authenticated routes.

1. **Auth** — email/password with the same "smart auth" semantics as
   `app/(auth)/actions.ts` (sign in, else create account, else report a wrong
   password), plus magic link. Confirmation and magic-link emails return to the
   app through Universal Links.
2. **Intake** — first/last name, birth date, birth time, birthplace, optional
   photo. Native wheel pickers replace the HTML `date`/`time` inputs, which
   removes the class of bug addressed in commit `75001a4` and the
   `input[type="date"]` overrides in `globals.css`.
3. **Home** — today's reading and entry points, mirroring `app/(app)/app/page.tsx`.
4. **Chat** — streaming reading with the tradition switcher (vedic / western /
   numerology), markdown rendering matching `.prose-reading`, and past
   conversations. Replaces the `AppShell` sidebar with native navigation.
5. **Profile** — birth details, computed chart, and the kundli PDF via
   `/api/kundli`, presented in a native share sheet.

Place autocomplete uses the existing `/api/geocode` route rather than MapKit,
because the server pairs geocoding with `tz-lookup` to resolve the timezone —
which the ephemeris requires for a correct chart.

## Native capabilities

Beyond platform-standard UI, these establish the app as more than a wrapped
website (see Compliance):

- **Push notifications** — a daily transit reading. Requires a scheduled Vercel
  cron job and an APNs key.
- **Face ID / Touch ID lock** on the chart and past readings.
- **Share sheet** for the kundli PDF and individual readings.
- **Haptics** on chart interactions and reading completion.
- **Offline cache** of the computed chart and past readings.

## Auth and session

`supabase-swift` handles sign-in and token refresh; the session is stored in the
Keychain, not `UserDefaults`. Every request to a Vercel route carries
`Authorization: Bearer <access_token>`.

Email confirmation and magic links currently redirect to `${origin}/auth/callback`.
For the app, Universal Links are configured so those links open Astra directly
and the callback is handled in-app. Absent this, a user who signs up on the app
would complete confirmation in Safari and the app would never see the session.

## App Store compliance

- **5.1.1(v) — account deletion.** The app offers signup, so it must offer
  in-app account deletion. This does not exist today and is a hard rejection.
  Covered by `DELETE /api/account`.
- **Privacy policy.** A hosted URL is required, linked in App Store Connect and
  in-app.
- **Privacy nutrition label.** Must declare birth date, birth time, birth
  location, email, and photo as collected, with their purposes.
- **4.2 — minimum functionality.** A native implementation with the capabilities
  above clears this comfortably; the risk applied to the WebView approach that
  was considered and rejected.
- **Sign in with Apple is not required.** Guideline 4.8 triggers on third-party
  social login; Astra uses only email/password and magic link.

## Build configuration

`ASTRA_API_BASE_URL` and the Supabase URL and anon key are supplied per Xcode
scheme, so Debug can target a local `next dev` and Release targets production.
The anon key is publishable by design and safe in the binary; RLS is the
security boundary. The service-role key never leaves Vercel.

## Testing

- **Swift unit tests** for the API client, streaming parser, session handling,
  and date/timezone conversion.
- **Snapshot tests** for the themed components, asserting fidelity against the
  four tokens.
- **XCUITest** for the critical paths: signup through intake to first reading,
  and the magic-link Universal Link return.
- **The existing `vitest` suite** continues to cover the astrology engine
  unchanged. New API routes get route-level tests.
- **Manual device testing** for push, Face ID, share sheet, and Universal Links,
  none of which are reliable on the Simulator.

## Sequencing

1. Backend: bearer auth, `/api/profile`, `/api/account`, Universal Links file.
2. Xcode project, theme, and API/Supabase client.
3. Auth and intake, including the Universal Link return path.
4. Chat with streaming.
5. Profile, kundli PDF, and account deletion.
6. Native capabilities: push, Face ID, share, haptics, offline cache.
7. App Store Connect: icon, screenshots, privacy policy, nutrition label,
   TestFlight, submission.

Steps 1 and 2 are independent and can proceed in parallel.

## Open items

- **The production API base URL** must be filled in once `vercel login` as
  `shivvyas0209@gmail.com` confirms the deployment hostname. Universal Links
  also require a stable domain, so a custom domain is preferable to a
  `*.vercel.app` URL.
- **The bundle identifier** and App Store display name.
- **The APNs key** must be created in the Apple Developer account before push
  work begins.
