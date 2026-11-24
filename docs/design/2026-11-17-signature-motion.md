# Signature motion — Design Note

**Date:** 2026-11-17
**Status:** Proposed. Moments 2 and 4 revised 2026-11-24 to be hand-drawn
(approved and built in 1.2 (32)); moments 1, 3 and 5 unchanged and not part of this build.

## Revision, 2026-11-24: hand-drawn

The user asked for hand-drawn animation on the charts and the dasha, matching
the app's UI, and watched two versions in a browser demo:

| Version | Trade-off | Decision |
|---|---|---|
| **A. Draws by hand, then settles** into today's screen | Readable; nothing else in the app has to change. The ink lasts seconds. | **Chosen by the user** |
| A, keeping drawn symbols at rest | More character at rest | Not chosen. English charts already rest on symbols, so little is lost |
| B. Stays hand-drawn | Most character; the PDF, widgets and share card would no longer match | Not chosen |

This keeps the rule below that a screen at rest never changes.

**The ink.** A line is sampled every few points and pushed off its path by
seeded noise (about 2pt), with a varying width (about 1.6pt) and one fainter
second stroke. The seed is fixed, so the ink never shimmers. Two numbers drive
it: how much is drawn (0 to 1) and how hand-drawn it is (1 to 0). Settling
animates the second to 0, so the same line straightens into the clean one, then
the real view takes over and the overlay is removed. No blur, glow or texture.

## Why

Astrya 1.1 is live on iPhone and iPad. Before nominating it for App Store
featuring, the user wants the app to feel like an experience: a few moments
that are visually astonishing and genuinely surprising, without breaking the
app's story or its look. The nomination will be for the release that carries
this work (1.2), as an upcoming version.

The story the motion must tell is the app's promise: **a real engine computes
every value, and the AI only interprets it.** Motion should make that visible —
your real sky, assembling itself — never decorate for its own sake.

## Goals

- Five moments, each one playing **once** at a meaningful point and then
  standing still:
  1. First open (the sign-up / sign-in screen).
  2. The Kundli reveal (the signature moment).
  3. Today's featured reading arriving.
  4. The Life (dasha) timeline appearing.
  5. The welcome tour.
- Driven by real data where data exists (planet signs and degrees, dasha
  dates, today's date).
- Feels native and premium on iPhone and iPad, in every orientation iPad
  supports.

## Non-goals

- No new screens, features or copy changes beyond what a moment needs.
- No sound or haptics beyond one light haptic where noted.
- No changes to the web app.

## Anti-goals (a failure even if it works)

- Anything that **animates for ever** or loops. `Theme.swift` and the
  2026-10-02 design note forbid it: repeating transactions made the chat
  stutter while a reading streamed.
- **Blur, glow or shadows.** The look is flat colour, hairlines and large type.
- Motion that **delays the reader**: every moment can be tapped through, and
  none blocks input for more than its own length.
- Motion that ignores **Reduce Motion** (iOS or Settings › Accessibility in the
  app). Under Reduce Motion each moment shows its final state at once, or with
  a plain cross-fade of at most 0.2s.
- Fake data: planets must land where the chart says they are.

## Constraints

- SwiftUI, iOS 17 deployment target (so `keyframeAnimator`, `phaseAnimator`,
  `Canvas`, `TimelineView` and `Path.trim` are all available). No new
  packages.
- Timing comes from `Theme`: `Theme.ease` (the site's
  `cubic-bezier(0.22, 1, 0.36, 1)`), `Theme.snap`, and `Theme.motion(_:)`, all
  of which return nil under Reduce Motion. New timings go through
  `Theme.motion` so they inherit that.
- Colours only from `Theme` tokens: ground `bg`, bone `fg`, the one accent
  `accent` (lime), `ember` for Vedic/warm, `violet` for Western/timeline/cool.
- Motion changes how a screen arrives, never how it looks at rest (see
  "Resolved after review" for how each moment ends).
- A `TimelineView` that drives a moment must stop (paused schedule or removed
  from the hierarchy) when the moment ends.
- VoiceOver: the accessibility tree is in its final state from the first frame;
  animation is visual only.

## Approaches

| Approach | Trade-off | Decision |
|---|---|---|
| **A. Native SwiftUI** — `Path.trim`, `keyframeAnimator`, `Canvas`, one-shot `TimelineView` | No dependencies, data-driven, plays once, free under Reduce Motion, near-zero GPU. Most hand-tuning of timing. | **Chosen by the user.** |
| B. A plus Metal shaders (a star grain on first open) | More "how did they do that", but cuts against the flat, no-glow, low-GPU look. | Not now; revisit only if A alone does not impress. |
| C. Lottie / Rive files | Designer polish, but a new dependency and the motion cannot use the reader's real planet positions, which breaks the story. | Rejected. |

## The moments

Durations are targets for the builder to tune on device.

### 1. First open — `AuthView`

Plays when the screen first appears in a launch where the user has never
signed in (`AuthStore.hasSignedInBefore == false`). On later launches only the
headline's ease-in plays.

1. Ground only, then the **zodiac ring**: twelve hairline tick marks and the
   twelve sign glyphs on a thin circle, centred behind the headline, draw in
   with `trim` (0.0 → 1.0, ~0.9s).
2. The ring turns once, 30° (one sign), easing to rest (~0.8s), then stays
   still at low opacity behind the content.
3. The headline ("Create your account") rises 12pt and fades in, then the
   subtitle, then the fields and button stagger in at 60ms intervals.

```
        ·  ♈  ·  ♉  ·
     ♓               ♊      <- ring draws in, turns one sign, settles
   ·    Create your     ·
   ♒    account         ♋
     One email, one password…
        [ email          ]
        [ Create account ]
```

### 2. Kundli reveal — `KundliView` / `KundliChartView` (signature, hand-drawn)

Plays the first time a given chart is shown on screen (keyed by the profile id
and a hash of the chart, in `UserDefaults`), so a changed birth time plays it
again. Every page stays mounted, so "shown" means the Kundli tab is selected,
not that the view appeared. Replay: long-press on the chart, and a VoiceOver
action. About 5 seconds; a tap jumps to the end.

1. **The sky (0 to 1.8s).** An ink circle with twelve ticks draws itself.
   Each planet, a pen-drawn symbol in ember, starts at 0 Aries and sweeps
   counter-clockwise, just inside the circle, to its real absolute longitude.
   Moon first; Saturn, Rahu and Ketu last. Retrograde planets overshoot about
   7 degrees and come back. Planets closer than 8 degrees fan out along the
   radius so none covers another; their angles stay true.
2. **The chart is sketched (1.7 to 3.1s).** The circle fades as the outer
   square, the two diagonals and the inner diamond are inked in turn, corners
   slightly overshot.
3. **Planets land (2.6 to 3.8s).** Each arcs to its place in its house, turning
   from ember to bone. Rashi numerals fade in. The lagna house is outlined in
   lime. One light haptic as the last planet lands.
4. **It settles (4.1 to 4.9s).** Lines straighten to `Theme.chartLine`, and the
   drawn symbols cross-fade to the chart's own labels: glyphs in English, the
   two-letter forms in other scripts, with the lime R and the lagna wash. The
   end is today's chart exactly.

On a phone the chart starts below the fold, so the screen scrolls it into view
once before the reveal. It waits until 80% is visible and no sheet covers it.

Chandra lagna (unknown birth time) uses the turned chart's houses. Divisional
charts (D9, D7), when built, reuse steps 2 to 4 without the sky.

### 3. Today's featured reading — `InboxView`

Plays once per reading, the first time a given unread featured reading is
shown.

1. The date's numerals count up from 01 to today's day (~0.5s).
2. The slot pill (morning lime / night violet) slides in.
3. The reading's title appears word by word (~40ms per word, capped at 1.2s),
   then the rest of the card fades in. The "Earlier" rows stagger in below.

### 4. Life timeline — `TimelineView` (the dasha screen, hand-drawn)

Plays the first time the Life tab is selected in each launch, once the periods
have loaded. About 3.8 seconds; a tap jumps to the end.

Changed while building, because the rows start below the "Where you are now"
card and an inking of the whole list would play off-screen: each row inks its
own stretch of spine and node as it scrolls into view, once per launch.

1. The row's spine is inked downward.
2. Its node is drawn; text is always there.
3. The lime node drops onto the current period, sketched and hatched, and
   pulses **once** (1.2 to 2.2s).
4. The current band's `BrutProgressBar` fills with a lime pen stroke while
   `NowCard` counts its percent up.
5. Everything straightens into today's spine, nodes and bar (2.9 to 3.7s).

Nothing changes layout or scroll position: the ink is drawn over the existing
rows, which fade in under it. Expanding a band during the moment ends it.

### 5. Welcome tour — `WelcomeTourView`

On each page change, the page's SF Symbol scales from 0.6 and the colour
field behind it grows from the symbol's centre to fill the page (~0.6s), then
the large word and sentence fade up. Paging back plays the same, reversed
direction.

## Building blocks

- `MotionGate` (new, small): decides whether a keyed moment should play
  (once-ever, once-per-launch, once-per-item) and records that it has.
  Returns false under Reduce Motion.
- `DrawIn` view modifier: animates a shape's `trim` from 0 to 1 via
  `Theme.motion`.
- `Stagger` helper: delays children by index.
- `InkStroke` (new): the hand-drawn line above, drawn in one `Canvas`.
- `PlanetInk` (new): the nine planet symbols as pen strokes.
- `ZodiacRing` shape/view: ticks and glyphs, reused by moments 1 and 2.
- A tap anywhere on a playing moment jumps it to its final state.

## Testing

- Unit tests that `InkStroke` is the same every time for a seed, stays within
  its wobble, and lies exactly on the clean line when fully settled.
- Unit tests for `MotionGate` keys and for the planet longitude maths
  (rashi index × 30 + degree; Rahu/Ketu 180° apart).
- Existing default-size snapshots stay identical (resting states unchanged).
- Snapshots of each moment's final frame under Reduce Motion.
- Manual check on device: iPhone, iPad in all orientations, Reduce Motion on
  and off, VoiceOver on, and a reading streaming in Ask while the Kundli
  reveal plays in another tab (no stutter).

## Left to the builder

- Exact durations and offsets.
- Glyph rendering for planets and signs (SF Symbols where they exist, text
  glyphs otherwise).
- Whether the Today count-up uses `contentTransition(.numericText())` or a
  manual counter.

## Resolved after review (builder's questions, settled as my calls)

1. **Resting screens do not change.** Every moment ends on today's exact
   resting layout:
   - First open: the zodiac ring plays in the existing `OrbitDecoration`'s
     place (right, above the headline, never behind text), then fades out,
     leaving the orbit as it is today. The orbit's existing blur is untouched
     (out of scope).
   - Kundli: Replay lives in the chart's context menu (long-press) and as a
     VoiceOver custom action, not in the header.
   - Welcome tour: the colour field grows from the symbol, then recedes to
     the existing 4% circle.
   - Life: only the current band's `BrutProgressBar` fills; no bars are added.
2. **"Pixel-identical" is checked by review, not a new harness.** The existing
   snapshot tests stay as they are (they check that something drew). For each
   moment, a test renders the final frame under Reduce Motion to PNG for a
   human to look at; nothing diffs pixels.
3. Covered by 1: the ring does not sit behind the headline.
4. **Today:** the count-up runs on the Today tab's header `BigNumber` (today's
   date), once per day, Today tab only. The word-by-word title runs on the
   featured card, once per reading, in both the tab and the sheet.
5. **Life:** superseded by the hand-drawn moment 4 above. The marker is still
   the lime spine dot on the current band.

## Calls made without asking (check these)

- Speed is the demo's, since the user raised no objection to it.
- Only the Kundli reveal and the Life timeline are built now.
- The web is unchanged: it has no on-screen chart, only the PDF.

- Kundli reveal replays when the chart changes, and there is a Replay control.
- First-open ring plays only before the first sign-in ever.
- Life timeline plays once per launch, not once ever.
- One haptic, at the end of the Kundli reveal; none elsewhere.
- Ships as 1.2; the featuring nomination waits for that build.
