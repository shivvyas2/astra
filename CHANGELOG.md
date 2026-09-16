# Changelog

All notable changes to Sanchara are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Every timeline period explained.** Each dasha period now carries a one-line theme and a short plain-language meaning written from the user's chart and the moments pinned in it, plus a "where you are now" summary for the current period. A "What are these periods?" explainer is one tap away.
- **Chat knows the timeline.** Readings see the user's current period and pinned moments, so questions about a particular year are answered against what actually happened.
- **Better moment extraction.** The scan resolves relative dates and ages from the message date and birth date, quotes the words each moment came from, keeps events it cannot date and asks for the year, and offers to look again after ten new messages.
- **Current-period widget.** A Home Screen and Lock Screen widget showing the mahadasha and sub-period the user is in, progress through it, and its theme. Tapping opens the timeline.
- **Go-live checklist** in `docs/GO_LIVE_CHECKLIST.md` for the Vercel secrets and Supabase migrations the morning readings and pushes depend on.

### Fixed

- The iOS app reported its push environment from the build configuration rather than the signing entitlement, so a Release build from Xcode registered a sandbox token as production and never received a push.

## [0.1.0] - 2026-09-16

The first tagged release. Everything below has shipped to production on Vercel; the iOS app is in development builds.

### Added

- **Chart engine.** Real Vedic (sidereal, Lahiri) and Western (tropical) charts from the Swiss Ephemeris: ascendant, houses, planetary positions, nakshatras, Vimshottari dasha, doshas, live transits, and numerology.
- **Readings.** Streaming chat grounded in the computed chart, with Vedic, Western, and numerology modes and an optional deep reading on Opus.
- **Kundli PDF.** Downloadable chart with grahas, nakshatras, dasha periods, and numerology.
- **Life timeline.** The dasha periods drawn as a life map. Moments can be pinned by hand or proposed from the user's own chat history and confirmed before anything is saved.
- **Daily readings and dosha alerts.** A morning and a night reading per user on their local clock, and a push notification only when a dosha or hard transit starts or ends.
- **iOS app.** Native SwiftUI client with email-code and Apple sign-in, intake with a profile photo, chat, kundli, readings inbox, and the timeline.
- **On-device answers, Siri, and widgets.** Chart lookups answered on the phone, five Siri phrases, a Home Screen widget, and a Control Center button.
- **Admin.** Isolated admin login with read-only access to user transcripts and profiles.
- **Marketing site.** Cosmic landing page with hero, how-it-works, and sign-up sections.

### Changed

- The app is now called Sanchara. The iOS target, copy, and prompts were renamed from Astra. The bundle identifier and production hostname are unchanged.
- Vimshottari antardashas are laid out from each mahadasha's virtual start, so sub-periods line up with the real period rather than the birth moment.

[0.1.0]: https://github.com/shivvyas2/astra/releases/tag/v0.1.0
