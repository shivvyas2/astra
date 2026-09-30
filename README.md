<h1 align="center">Sanchara</h1>

<p align="center">An astrology app that computes a real birth chart and has Claude interpret only the computed facts. Web on Vercel, native on iOS, one API, one Supabase project.</p>

<p align="center"><a href="docs/handbook/Sanchara-Engineering-Handbook.pdf">Read the engineering handbook</a> · <a href="https://github.com/shivvyas2/astra/releases/latest">Latest release</a> · <a href="CONTRIBUTING.md">Contribute</a></p>

<p align="center">
  <a href="https://github.com/shivvyas2/astra/actions/workflows/ci.yml"><img src="https://github.com/shivvyas2/astra/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Next.js-15-black.svg" alt="Next.js 15">
  <img src="https://img.shields.io/badge/iOS-17%2B-black.svg" alt="iOS 17+">
  <img src="https://img.shields.io/badge/Swift-5-orange.svg" alt="Swift 5">
</p>

Sanchara is an astrology app that computes a person's real birth chart from their birth date, time, and place, then has Claude interpret it. It ships as a Next.js web app on Vercel and a native SwiftUI app for iOS, both backed by one API and one Supabase project.

Nothing about the chart is guessed. The Swiss Ephemeris computes planetary positions, houses, nakshatras, dashas, doshas, and transits server-side. Claude only interprets those computed values.

## Features

- **Chart-grounded readings.** Streaming chat with an astrologer that reads the user's computed chart. Vedic (sidereal, Lahiri), Western (tropical), and numerology modes, chosen per conversation.
- **Kundli.** The full Vedic chart as an on-screen diagram and a downloadable PDF with grahas, nakshatras, dasha periods, and numerology.
- **Life timeline.** The user's Vimshottari dasha periods laid out as a life map, each with a plain-language theme and meaning written from their chart and the moments in it. Users pin real moments by hand, or accept moments Claude finds in their own chat history, with the quote it came from. The chat sees the timeline too. A widget shows the current period.
- **Daily readings and dosha alerts.** A morning and night reading per user on their local clock, plus a push notification only when a dosha or hard transit starts or ends.
- **On-device answers, Siri, and widgets.** The chart is cached on the phone, so lookups like "which dasha am I in" are answered by Apple's on-device model, and a Home Screen widget shows today's reading with no network call.
- **Auth.** Email plus six-digit code, and Sign in with Apple. Universal Links bring email links back into the app.
- **Admin.** An isolated admin area with its own login for reading user transcripts.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web and API | Next.js 15 (App Router), React 19, TypeScript 5.9, Tailwind CSS 4 |
| AI | Anthropic SDK. Sonnet 5 for readings, Opus 4.8 for deep readings |
| Astrology engine | swisseph-wasm (Swiss Ephemeris), luxon, tz-lookup, Open-Meteo geocoding |
| Database and auth | Supabase (Postgres, Auth, Storage, Row Level Security) |
| Push | Apple Push Notification service, signed with a .p8 key |
| PDF | pdf-lib |
| Landing page | three.js, GSAP |
| iOS | SwiftUI, iOS 17+, supabase-swift, App Intents, WidgetKit, XcodeGen |
| Hosting | Vercel, with Vercel Cron for the scheduled jobs |
| Tests | Vitest for the web, XCTest for iOS |

## Architecture

```
                    ┌────────────────────────┐
  Web browser ─────►│  Next.js on Vercel     │
                    │  pages + route handlers│──► Anthropic API
  iOS app ─────────►│  /api/*  (bearer auth) │──► Swiss Ephemeris (WASM, in-process)
                    └───────────┬────────────┘──► APNs
                                │
                    ┌───────────▼────────────┐
                    │  Supabase              │
                    │  Postgres + RLS, Auth, │
                    │  Storage (avatars)     │
                    └────────────────────────┘
```

The web app talks to Supabase through cookies. The iOS app signs in with supabase-swift directly and calls the same route handlers with a bearer token. Every table is protected by Row Level Security, so the anon key is safe to ship in the iOS binary. The service-role key and the Anthropic key never leave the server.

Two cron schedules in `vercel.json` hit `/api/cron/daily`, which writes the twice-daily readings and runs the dosha sweep. The job is idempotent, so extra runs are harmless.

## Repository layout

```
.
├── app/                       Next.js App Router
│   ├── page.tsx               Marketing landing page
│   ├── (auth)/                Login, signup, check-email
│   ├── (app)/app/             Signed-in web app: home, intake, chat, profile
│   ├── admin/                 Isolated admin area with its own login
│   ├── auth/callback/         Supabase auth redirect
│   └── api/                   Route handlers shared by web and iOS
│       ├── chat/              Streaming readings
│       ├── kundli/            Chart JSON and PDF
│       ├── profile/           Birth-detail intake
│       ├── timeline/          Dasha life map, plus /scan for extraction
│       ├── life-events/       Pin and unpin moments
│       ├── devices/           APNs token registration
│       ├── account/           Account deletion
│       ├── geocode/           Birthplace autocomplete
│       └── cron/daily/        Scheduled readings and alerts
├── components/                React components (Chat, AppShell, IntakeForm, marketing/)
├── lib/
│   ├── astrology/             Pure chart engine: chart, dasha, doshas, transits, numerology, prompt
│   ├── timeline/              Life map builder and chat-history event extraction
│   ├── alerts/                Daily readings, dosha alerts, local-time slots
│   ├── data/                  Supabase reads and writes for profiles, chats, history
│   ├── supabase/              Browser, server, admin, and bearer-token clients
│   ├── pdf/                   Kundli PDF renderer
│   ├── push/                  APNs client
│   ├── admin/                 Admin guard and queries
│   ├── anthropic.ts           Model names and effort settings
│   └── env.ts                 Server-only environment access
├── middleware.ts              Refreshes the Supabase session on every request
├── supabase/migrations/       Numbered SQL migrations
├── public/.well-known/        Apple App Site Association for Universal Links
├── docs/                      Setup guides, design notes, and the handbook
│   ├── handbook/              The engineering handbook, as PDF, EPUB, and HTML
│   └── design/                Design notes, one per feature
├── mobile/                    The iOS app (see below)
├── vercel.json                Cron schedules
└── .env.example               Every environment variable, documented
```

### iOS app layout

The Xcode project is generated from `mobile/project.yml` by XcodeGen and is not committed.

```
mobile/
├── project.yml                XcodeGen spec: targets, entitlements, capabilities
├── scripts/
│   ├── make-config.sh         Writes AppConfig.swift from .env.local
│   └── make-icon.py           Renders the app icon
├── Sanchara/
│   ├── Info.plist
│   ├── Sanchara.entitlements  Push, Sign in with Apple, App Groups, Universal Links
│   ├── Resources/             Asset catalog: icon, launch colour
│   ├── Sources/
│   │   ├── SancharaApp.swift  Entry point
│   │   ├── RootView.swift     Routes between auth, intake, and chat
│   │   ├── Design/            Theme, shared components, reading card
│   │   ├── Features/
│   │   │   ├── Auth/          Email code and Apple sign-in
│   │   │   ├── Intake/        Birth details and profile photo
│   │   │   ├── Chat/          Readings, history, on-device answers
│   │   │   ├── Kundli/        Chart diagram
│   │   │   ├── Timeline/      Life map, add a moment, review found moments
│   │   │   ├── Alerts/        Readings inbox and dosha alerts
│   │   │   └── Profile/       Profile view and avatar
│   │   ├── Intents/           Siri phrases, Shortcuts, deep links
│   │   ├── Services/          API client, Supabase, push, chart cache, widget refresh
│   │   └── Generated/         AppConfig.swift (generated, ignored)
│   └── Tests/                 XCTest unit tests
└── SancharaWidgets/           Home Screen widget and Control Center button
```

## Getting started

### Prerequisites

- Node.js 24
- A Supabase project
- An Anthropic API key
- For iOS: Xcode 26, XcodeGen (`brew install xcodegen`), and an Apple Developer account

### Web

```bash
npm install
cp .env.example .env.local     # fill in the values
npm run dev                    # http://localhost:3000
```

Apply the migrations to your Supabase project in order:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file under `supabase/migrations/` into the SQL editor, lowest number first. Follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for the auth settings, storage bucket, and the first admin user.

### iOS

```bash
cd mobile
./scripts/make-config.sh       # reads the Supabase URL and anon key from ../.env.local
xcodegen generate
open Sanchara.xcodeproj
```

Set `SANCHARA_API_BASE_URL` before running the config script to point the app at a local or preview API. It defaults to the production API.

Sign in with Apple, push notifications, App Groups, and Universal Links each need a one-time setup in the Apple Developer portal and Supabase. The guides are:

- [docs/APPLE_SIGN_IN.md](docs/APPLE_SIGN_IN.md)
- [docs/PUSH_ALERTS.md](docs/PUSH_ALERTS.md)
- [docs/SIRI_AND_WIDGETS.md](docs/SIRI_AND_WIDGETS.md)
- [docs/EMAIL_OTP.md](docs/EMAIL_OTP.md)

## Environment variables

All of these are documented in `.env.example`. The first four are required. The rest enable push alerts and can be left blank.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key, safe for clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Admin reads and cron jobs |
| `ANTHROPIC_API_KEY` | Server-only |
| `CRON_SECRET` | Bearer token Vercel sends to the cron route |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY` | Apple push credentials |

## Testing

```bash
npm test                       # Vitest: chart engine, prompts, alerts, timeline, route handlers
npx tsc --noEmit               # Typecheck
```

```bash
cd mobile
xcodebuild -project Sanchara.xcodeproj -scheme Sanchara \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

## Deployment

The web app deploys to Vercel from the `main` branch. Environment variables are set in the Vercel project for Production and Preview. The full walkthrough, including the cron secret and APNs keys, is in [docs/DEPLOY.md](docs/DEPLOY.md).

After deploying a version that adds a migration, apply it to the production Supabase project before traffic reaches the new code.

iOS builds go through Xcode to TestFlight. Before archiving, switch `aps-environment` in `mobile/project.yml` to `production` and regenerate the project. A push token minted under one environment is invalid in the other.

## CI/CD

Three GitHub Actions workflows live in `.github/workflows/`.

| Workflow | Runs on | What it does |
| --- | --- | --- |
| `ci.yml` | Every push to `main` and every pull request | Web: typecheck, Vitest, `next build`. iOS: XcodeGen, then an unsigned simulator build and the XCTest suite on a macOS 26 runner. Secrets: a gitleaks scan of the full history. |
| `release.yml` | Tag `v*` | Creates the GitHub release with that version's section of `CHANGELOG.md` and the handbook PDF and EPUB as assets. |
| `ios-testflight.yml` | Tag `v*`, or by hand | Archives the app with the version from the tag and the run number as the build number, switches push to the production environment, and uploads to App Store Connect. |

Web deployment is handled by Vercel's Git integration, so there is no deploy step in Actions. Every push to `main` becomes a production deployment once CI passes.

The TestFlight workflow needs five repository secrets. Signing is automatic through the App Store Connect API, so no certificates are stored in GitHub.

| Secret | Value |
| --- | --- |
| `SUPABASE_URL` | Same as `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Same as `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_KEY_P8` | Full contents of the downloaded `.p8` file |

Create the key at App Store Connect under Users and Access, Integrations, with the App Manager role. The app record for `com.shivvyas.astra` must already exist there.

## Releasing

Releases are tagged from `main`.

1. Make sure CI is green.
2. Add a section to `CHANGELOG.md` and bump `version` in `package.json`.
3. Commit, tag, and push:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main --tags
   ```

The tag triggers the GitHub release and the TestFlight upload. Vercel deploys the commit.

## The handbook

<a href="docs/handbook/Sanchara-Engineering-Handbook.pdf"><img src="docs/handbook/cover.jpg" width="160" align="right" alt="Sanchara Engineering Handbook cover"></a>

The Sanchara Engineering Handbook is the long-form description of the system in 16 chapters and 3 appendices: the architecture, the chart engine, how a reading is written and what it costs, identity and access, one chapter per feature (intake, chat, kundli, the life timeline, daily readings and alerts, on-device answers and widgets, profile and admin, the web shell), then the data model, the iOS project, setup and release, and a catalogue of what breaks and what catches it. Read the chapter for the area you are changing before a large change.

- [PDF](docs/handbook/Sanchara-Engineering-Handbook.pdf) and [EPUB](docs/handbook/Sanchara-Engineering-Handbook.epub) in the repo
- Downloads on the [latest release](https://github.com/shivvyas2/astra/releases/latest)
- Source chapters in `docs/handbook/src/chapters/`, built with `docs/handbook/make-book.sh` (`build.py`, then `render-pdf.sh`, then `render-epub.sh`)

Where the code and the handbook disagree, the code is right and the handbook has a bug. Please file it.

<br clear="all">

## Costs

What a reading costs, and the caching and effort settings that keep it low, are in [docs/MODEL_COSTS.md](docs/MODEL_COSTS.md).

## Design notes

The design notes that preceded each feature are under `docs/design/`: the original web app, the native iOS app, the timeline and widget and push work, and the specific-readings work that moved Vedic charts to whole-sign houses. The product was called Astra during development. The repository, bundle identifier, and production hostname still carry that name.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for how the repo works: one branch per change, conventional commits, a design note for anything larger than a fix, and the tests above before you open a pull request. Security issues go through [SECURITY.md](SECURITY.md), not the issue tracker.

## Privacy

Birth details and conversations are personal. Every table is behind Row Level Security, the model is handed one user's computed chart and nothing else, and the service-role and model keys never leave the server. There is no analytics SDK, no ad SDK, and no third-party crash reporter.

## License

[MIT](LICENSE). The Swiss Ephemeris is used through `swisseph-wasm` under its own licence; check it before redistributing a build commercially.
