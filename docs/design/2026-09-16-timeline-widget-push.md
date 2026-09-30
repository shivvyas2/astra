# Timeline meaning, current-period widget, and morning push — Design Spec

**Date:** 2026-09-16
**Status:** Approved

## Summary

The timeline draws a person's Vimshottari dasha periods with their pinned life
moments, but names each period only by its planet. This spec gives every period
a plain-language meaning, lets the chat see the timeline, improves how moments
are mined from chat history, adds a Home Screen widget for the current period,
and makes the existing morning reading and push actually reach phones.

Principle: the server computes and explains; the phone renders and caches.

## 1. A meaning for every period

### Data

New table `period_readings` (migration `0007_period_readings.sql`):

| column | type | notes |
| --- | --- | --- |
| user_id | uuid | owner, cascade delete |
| lord | text | mahadasha lord, or the literal `now` for the "where you are" summary |
| period_start | date | mahadasha start; for `now`, the current antardasha start |
| theme | text | one line, under 60 characters, no astrology jargon |
| meaning | text | 2 to 4 sentences, plain language |
| events_hash | text | hash of the pinned events inside the period at generation time |
| generated_at | timestamptz | |

Unique on `(user_id, lord, period_start)`. RLS: owner may select, insert,
update, delete. Rows are written by the explain route acting as the user.

### Generation

`lib/timeline/explain.ts`:

- `buildExplainSystem({ firstName, birthDate, today })` — the system prompt.
  Rules: write for someone who has never heard the word dasha; never mention
  the planet's astrological keywords without a concrete life reading; when
  the user pinned moments in a period, name them and say how they fit; a
  future period is described as what it tends to bring, not as fate; a past
  period is described in past tense.
- `buildExplainTask(timeline)` — one user message listing all periods (lord,
  years, sub-periods, pinned moments) and asking for one line per period plus a
  `now` line, pipe-delimited: `LORD | START | THEME | MEANING`. The `now` line
  is `now | <antardasha start> | THEME | MEANING` and covers the current
  mahadasha–antardasha pair.
- `parseExplanations(text, timeline)` — reads lines, drops anything whose lord
  and start do not match a real period, trims theme to 60 and meaning to 600
  characters. Model output is validated the same way `extract.ts` does.
- `eventsHashFor(period, events)` — stable hash of `occurredOn:title` for the
  events inside the period, sorted. Empty set hashes to `"0"`.
- `explainTimeline(args)` — calls Claude once (READING_MODEL, low effort,
  1h cached system block) and returns parsed rows.

### API changes

`GET /api/timeline` response gains:

```
periods[i].theme:   string | null
periods[i].meaning: string | null
periods[i].stale:   boolean      // no row, or events_hash differs
now: { lord, antardasha, start, end, theme, meaning } | null
needsExplaining: boolean         // any stale period or missing now row
messagesSinceScan: number        // user messages newer than scanned_at (0 if never scanned)
```

`POST /api/timeline/explain` (new): loads the timeline; if `needsExplaining`,
runs `explainTimeline` and upserts every returned row; returns the same shape
as GET. One Claude call refreshes all twelve periods, so partial refresh is not
worth the complexity. A model failure leaves existing rows in place and returns
the GET shape with `needsExplaining` still true.

### iOS

- `TimelineStore.load()` then, if `needsExplaining`, calls
  `SancharaAPI.explainTimeline()` in the background and replaces periods and
  `now` when it returns. Bands render immediately; meanings fill in.
- `BandRow` header shows the theme under the lord: `SATURN` / `Building slowly,
  then being tested`. Expanded state shows the meaning paragraph above the
  sub-periods.
- A `NowCard` at the top of the list: "Where you are now", the pair
  (`Saturn – Mercury`), the year range, the progress bar, and the `now` meaning.
- A "What are these periods?" button in the footer opens `PeriodExplainerView`,
  a static sheet in plain words (what a dasha is, why the lengths differ, why
  moments are pinned).
- After a successful load the store writes `ChartCache.save(period:)` (see §4).

## 2. Chat knows the timeline

`lib/timeline/describe.ts`: `describeTimelineForPrompt(timeline, { tradition })`
returns a text block or `""`:

```
LIFE TIMELINE (what they have told us happened, placed in their dasha periods)
Now: Saturn mahadasha (2019–2038), Mercury antardasha (2024-03 to 2026-11).
Moments:
- 2019-11 · Left the job at the agency · Saturn–Saturn
- 2021 · Moved to Pune · Saturn–Mercury
```

Western mode gets the moments without the period column and no `Now` line.
At most 30 moments, most recent first. The chat route appends the block to
`stableSystem` for vedic and western modes. It sits in the cached system block;
it changes only when events change.

## 3. Better moment extraction

`lib/timeline/extract.ts` changes:

- Each transcript line already carries the message date. New prompt rules:
  resolve relative phrases from that date ("last March" in a 2025-06 message is
  2024-03, month precision; "two years ago" is year precision); resolve ages
  from the birth date ("when I was 25" is birth year + 25, year precision);
  keep a short verbatim quote as evidence.
- Output line becomes `DATE | PRECISION | TITLE | EVIDENCE`. `DATE` may be `?`
  when the event is clear but cannot be dated even to a year.
- `CandidateEvent` gains `evidence: string` (max 160 chars) and allows
  `occurredOn: null` with `precision: "unknown"`. Undated candidates are kept
  and returned after dated ones.
- Scan route: unchanged contract apart from the new fields.
- Re-scan: `GET /api/timeline` returns `messagesSinceScan`. The iOS offer shows
  when never scanned, or when `messagesSinceScan >= 10`. Copy changes to
  "Find new moments" on a re-scan.

iOS `CandidatesView`:

- Shows the evidence quote in muted italics under each row.
- An undated candidate shows a year picker (birth year to this year) in place
  of the date label, unselected by default; it cannot be added until a year is
  chosen. Confirming sends `occurredOn: "<year>-01-01", precision: "year"`.

## 4. Current-period widget

- `ChartCache` gains `CachedPeriod { lord, antardasha, start, end, antardashaStart, antardashaEnd, theme, nowMeaning, savedAt }` with `save(period:)`, `loadPeriod()`, and clearing on sign-out. The current dasha dates already exist in the cached `NatalChart.dasha`; the cache adds the theme and meaning.
- The app fetches the timeline quietly once per launch after the profile is
  ready (`ChatView.task`), so the widget fills without the timeline being opened.
- `SancharaWidgets/PeriodWidget.swift`: kind `SancharaPeriod`, families
  systemSmall, systemMedium, accessoryRectangular, accessoryInline. Shows the
  pair, the years, a progress bar through the mahadasha, and the theme. Empty
  state: "Open Sanchara to map your periods." Timeline policy: refresh after
  the next local midnight. Registered in the `SancharaWidgets` bundle.
- Progress math lives in `PeriodProgress` inside `ChartData.swift` (already
  compiled into both targets) and is unit-tested.
- Tapping the widget uses `widgetURL(URL("sanchara://timeline"))`. The app's
  `onOpenURL` routes `sanchara://timeline` to `DeepLink.pending = .timeline`,
  and `ChatView` opens the timeline sheet. The URL scheme `sanchara` is added
  to `project.yml` under `CFBundleURLTypes`.

## 5. Morning push, made real

- Schedule stays at 02:30 and 15:30 UTC (08:00 and 21:00 IST).
- Bug fix in `Push.swift`: the reported environment is read from the embedded
  provisioning profile's `aps-environment` entitlement (`embedded.mobileprovision`
  in the bundle, plist inside a CMS envelope, parsed by locating the
  `<plist` … `</plist>` span). Simulator or no profile: `sandbox`. The parser
  `ApsEnvironment.parse(profileText:)` is unit-tested.
- A go-live checklist `docs/GO_LIVE_CHECKLIST.md` lists the exact Vercel and
  Supabase steps the owner must run: log in as the right account, set
  `CRON_SECRET` and the four `APNS_*` variables, apply migrations 0006 and
  0007, trigger the cron by hand, and confirm a reading row and a push.

## Testing

- Vitest: `explain.test.ts` (parse, hash, prompt includes moments),
  `describe.test.ts`, additions to `extract.test.ts` (four-field lines,
  `?` dates, evidence trimming, relative-date rules present in prompt).
- XCTest: `PeriodProgressTests`, `ApsEnvironmentTests`, `ChartCache` period
  round trip, candidate year-picker state.
- CI runs both suites.

## Out of scope

Night readings, dosha alerts, and the existing reading widget are unchanged.
