# Changelog

All notable changes to Sanchara are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
