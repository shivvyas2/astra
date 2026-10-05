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

- **An admin dashboard that tracks everything, on the web and on iPhone.**
  `/admin` now opens on an overview for the last 7, 30 or 90 days: users, new
  sign-ups, active users, readings and Deep share, model spend in total, today
  and per reading, memory (facts, conversation summaries, open and settled
  predictions with a hit rate), daily readings, alerts sent, push devices and
  life events, with a day-by-day chart, readings by mode, spend by model and
  by kind of call, and the ten biggest spenders. The Users list searches and
  sorts, and each person's page shows their chart, plan, memory, predictions,
  a timeline of everything that happened to them, and read-only transcripts.
  Admins get the same screens on iPhone: an "Admin" row on You opens the
  dashboard full-screen, backed by a JSON API under `/api/admin/*` that the
  iOS app and the web admin share. The dashboard has its own light look,
  taken from the reference dashboard rather than the app's dark theme.
- **Every model call is recorded with its cost.** `model_usage` (migration
  `0010_usage.sql`) keeps one row per call: who, which kind (reading, Deep,
  memory, daily, alert, extraction), which model, the tokens in, cached and
  out, and the price in USD. Duplicate sends of the same question within a
  short window are answered once and paid for once. `GET /api/usage` reports
  a person's own counts for the day. None of it limits anything.
- **No limits, on purpose.** There are no daily or monthly caps, no plan
  gating and no 429s; Deep readings are open to everyone. Heavy use is
  flagged in the admin dashboard, never blocked. Savings come only from the
  server side: prompt caching, the on-device and Haiku memory passes, and
  deduping repeated requests.
- **AI consent before the first reading (web and iOS).** A full screen, in the
  app's own look, says plainly what a reading sends (birth details, chart,
  your messages, remembered facts), to whom (Anthropic, to write the reading;
  Apple's on-device model stays on the phone), what is stored where
  (Supabase), that the team can read transcripts and memory, and how to
  delete it. "Agree and continue" or "Not now", which explains why readings
  need it and offers it again. It comes before intake. Agreement is recorded
  per notice version (`ai_consents`, `POST /api/consent`), can be re-read and
  withdrawn from Profile, and the chat route refuses a reading with
  `403 consent_required` without it, failing open until migration 0011 is
  applied.
- **Astrya Plus, an optional subscription to support the app.** StoreKit 2 on
  iPhone, $6.99 a month or $49.99 a year in the "Astrya Plus" group, with
  Restore purchases, Manage subscription and the renewal terms on the sheet.
  Plus gates nothing: readings stay unlimited and Deep readings stay open to
  everyone. Every transaction is verified on the server against a pinned
  Apple Root CA - G3 (x5c chain, Apple's marker OIDs, ES256 signature, bundle
  and product ids) before `subscriptions` is written with the service role;
  App Store Server Notifications v2 keep renewals, grace periods, expiry and
  refunds current. `getPlan()` now returns the real entitlement. The web gets
  `/app/plus` (subscribe on iPhone for now) and a public `/privacy` page.
- **Memory, part two: conversations and predictions.** Astrya now remembers
  what you talked about, not only what you told it: a two-or-three-sentence
  summary of each conversation, and a ledger of every dated prediction a
  reading made (what, the window, how sure). Later readings stay consistent
  with what was predicted, or say plainly why they now read it differently,
  and can ask whether a prediction whose window has opened came true. "What
  Astrya knows" (web and iOS) gains "Past conversations" and "Predictions",
  with "Did this happen?" (Yes / No / Not sure) on predictions whose window
  has begun; everything is deletable. Facts now record whether they were
  stated or inferred, where they came from, and when you last confirmed them.
- **Readings get only the memory that matters.** Instead of every fact, a
  reading is handed the core of your life (work, relationship, home), your
  last three conversations and the predictions due now, plus whatever the
  question's topic makes relevant (career to the 10th, marriage to the 7th,
  money to the 2nd and 11th, and so on), all held under about 600 tokens. The
  question-specific part rides on the newest message so the prompt cache
  still hits.
- **On-device memory on iPhone.** With Apple Intelligence on, the iPhone
  writes the turn's facts, summary and predictions with Apple's on-device
  model and posts them to the new `/api/memory/ingest`; the server skips its
  Claude call for that turn, so memory costs nothing. Everywhere else one
  Claude Haiku call per turn now produces all three (it used to produce
  facts only). "What do you know about me?" on iPhone is answered from what
  the phone already holds, with no call at all. Readings stay on Sonnet 5.5
  and Deep on Opus 5.5. Needs migration `0009_memory.sql` (after 0008); until
  it is applied, facts work as before and summaries and predictions are not
  kept.
- **Sanchara remembers what you tell it.** After each reading, a small, cheap
  pass reads what you just wrote and keeps a short list of standing facts about
  your life: your job, your relationship, your family, your plans, what is
  worrying you. Only what you said about yourself is kept, never the reading's
  predictions or a guess. Every later reading is given the list, so a career
  question is read against the job you actually have and the prediction is tied
  to a dated window and a house or period. See and delete any of it, or all of
  it, under "What Sanchara knows" on the profile page (and on iOS). Needs
  migration `0008_user_facts.sql`; until it is applied, readings run exactly as
  before and the list is empty.
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

- **A new look, twice.** First a dark neo-brutalist pass on both platforms:
  flat fills, 2pt bone borders, hard offset shadows, heavy headings,
  monospaced labels and three flat accents (orange, violet, yellow), with the
  closing "In simple words" section of every reading lifted into a callout.
  Then, on iPhone, the look the owner's references asked for: one huge lime
  word on dark, soft colour fields, outlined rounded cards, underlined fields,
  round arrow buttons, and orbits and sparkles in the background. Lime is the
  accent, ember is kept for warnings and anything destructive. The web app
  and the marketing page still wear the first pass.
- **The app is called Astrya.** Every user-facing "Sanchara" is now
  "Astrya": the Home Screen name, the prompt persona, the kundli PDF name,
  the Spotlight keyword and the copy on both platforms. Identifiers, the
  `sanchara://` link scheme and stored settings keep their old names so
  installed widgets and preferences keep working.

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
