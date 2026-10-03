# Changelog

All notable changes to Sanchara are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- **The transcript no longer stutters, and you can scroll it.** The reading
  screen used to scroll to the bottom on every streamed chunk, fighting any
  attempt to scroll up and leaving the last lines just out of view. It now
  follows only while you are at the bottom, jumps once per new turn, and offers
  "Jump to latest" when you have scrolled away. The repeating animations and
  the blurred glow that cost frames during streaming are gone, the network
  layer reads the reply in chunks instead of one byte at a time, and arriving
  text is folded in at most every 80ms. The web chat got the same scroll fix.
- Force unwraps on the network path and in mode switching were removed.

### Added

- **Five named places.** The iOS app is now a tab bar: Today, Ask, Kundli,
  Life, You. The kundli was previously reachable only from Siri and the widget.
  Every screen opens with one line saying what it is for, and a one-time
  "What's where" sheet lists the five places. The reading mode is a labelled
  menu rather than a dot that cycled on tap.
- **Committed readings.** Every prediction now names what, when (a dated
  window), and how sure, picks the outcome the chart favours instead of
  writing both, and answers yes/no questions in the first sentence. The model
  is given the user's age, the end of the current sub-period and the next two,
  and the slow planets' upcoming sign changes to anchor those dates.

### Changed

- **A new look.** Dark neo-brutalism on both platforms: flat fills, 2pt bone
  borders, hard offset shadows, heavy headings, monospaced labels, and three
  flat accents (orange, violet, yellow). The closing "In simple words" section
  of every reading is lifted into a yellow callout. The marketing page is
  unchanged.

## [0.3.0] - 2026-09-18

### Added

- **Readings cite the chart, not the sign.** Every Vedic reading now carries the
  lord of each house and where that lord sits, which planets aspect what, each
  planet's dignity (exalted, debilitated, moolatrikona or own sign), which
  planets are combust, and where the lord of the running dasha is placed. The
  facts are computed once and stored with the chart, so a question about the
  10th house is answered from its actual ruler rather than a generality about
  the sign on it.
- **Transits read against the chart.** Gochara: each transiting planet is now
  reported by the house it occupies counted from the ascendant and from the
  natal Moon, along with the affliction those positions raise — Sade Sati and
  the rest — instead of a bare list of where the planets are. Vedic only.
- **Numerology goes deeper.** The reading now sees the personal year and
  personal month, the Lo Shu grid with its repeated and missing numbers, and
  how the core numbers relate to one another.
- **More answered on the phone.** On-device lookups now cover house rulers,
  aspects, strength ratings and combustion, so those questions are answered
  without leaving the device.

### Changed

- **Vedic houses are whole-sign.** The chart, the kundli PDF and the on-device
  table labelled houses whole-sign from the ascendant but filled them with
  Placidus numbers, so a planet could be drawn in a house marked with a sign it
  was not in, and two houses could share one sign — which leaves lordship
  undefined. Vedic charts are now whole-sign throughout. Existing charts upgrade
  themselves the first time they are read; nothing to do. Western charts are
  unchanged and stay Placidus.

### Fixed

- Western readings were being handed Vedic technique on a tropical chart:
  moolatrikona, graha drishti, house numbers from a different house system, and
  a standing-conditions block naming Mangal, Kaal Sarp and Pitru dosha. A
  Western reading now gets the plain sky again — where each body is and which
  natal body it sits on.
- A dosha fixed at birth could announce itself as news. Moving Vedic charts to
  whole-sign houses shifts how some natal conditions are detected, which would
  have pushed "Mangal Dosha has begun" to people whose chart has not changed
  since they were born. Natal conditions never alert now; they reconcile
  silently.
- The daily push prompt listed natal doshas twice.
- The natal dosha detectors read a planet's house from its sign rather than a
  stored house number, so they no longer disagree with the chart they are
  drawn from.
- Number relationships were resolved from a single row instead of compoundly.
- Transit afflictions were reported twice in the daily predictions.
- A failed read while loading a birth profile was reported as though the
  profile did not exist.

## [0.2.0] - 2026-09-16

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

[0.3.0]: https://github.com/shivvyas2/astra/releases/tag/v0.3.0
[0.2.0]: https://github.com/shivvyas2/astra/releases/tag/v0.2.0
[0.1.0]: https://github.com/shivvyas2/astra/releases/tag/v0.1.0
