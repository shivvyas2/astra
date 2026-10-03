# Smooth transcript, named places, committed readings — Design Note

**Date:** 2026-10-02
**Status:** Implemented

## The complaints

Three things came back from people using the app.

1. The reading screen stuttered while an answer streamed in, and you could
   not scroll to the bottom of a long answer while it was still arriving.
2. Nobody could find anything. The kundli was reachable only from Siri and
   the widget; the timeline and profile sat in a menu behind the avatar; the
   bell meant nothing until you tapped it. Every feature had to be explained
   in person.
3. Answers read like a horoscope. True of anyone with that Sun sign, hedged
   both ways, no dates.

And a direction: make it look different. Neo-brutalist.

## 1. The transcript

### Why it stuttered

`ChatView` scrolled to the bottom on every streamed chunk. A reader trying
to scroll up was dragged back down by the next chunk, and because the last
row kept growing after each jump landed, the final lines were often just
below the fold. Two `withAnimation(.repeatForever)` calls (the shimmer and
the caret) started transactions that leaked into every later layout change
in the hierarchy, so each chunk was laid out with an eased, repeating
animation. Behind it all a 40pt blur was animated for ever, keeping the GPU
compositing a large blurred layer on every frame. And the network layer
read the body one byte at a time through `URLSession.bytes`, an `await` and
a re-decode per byte.

### What changed

- The transcript uses `defaultScrollAnchor(.bottom)` and tracks whether
  the reader is within 80pt of the end. It jumps once per new turn, not per
  chunk, settles once when a reading finishes, and otherwise follows only
  while the reader is already at the bottom. A reader who has scrolled away
  gets a "Jump to latest" button.
- Scroll geometry lives in a reference type; only the derived "near the
  bottom" flag is published, and only when it flips.
- Shimmer and caret are driven by `SwiftUI.TimelineView`. No repeating
  animation transactions exist anywhere in the transcript.
- `SancharaAPI.chatStream` reads the body through a `URLSessionDataDelegate`
  (one element per network chunk) and an incremental UTF-8 decoder that
  holds back a split multi-byte character. `ChatStore` folds arriving text
  into the transcript at most every 80ms.
- The blurred glow is gone, along with every other blur and gradient.

## 2. Named places

The signed-in app is a tab bar: **Today** (readings and alerts), **Ask**
(the chat), **Kundli**, **Life** (the dasha timeline), **You** (profile and
account). Labels are always shown. Each screen opens with a `ScreenHeader`:
an eyebrow, a heading, and one sentence saying what the screen is for. A
one-time "What's where" sheet lists the five places; it can be reopened from
the profile.

The mode control in the composer, which used to be an unlabelled dot that
cycled on tap, is a menu naming each mode with one line on what it reads
from. On the opening screen the three modes are chips with the active one's
description underneath. Deep is a labelled toggle.

Sheet-based screens gained `embedded: Bool` so the same view serves as a
tab (no Done button, header inside the content) or as a sheet (as before).

## 3. The look

Dark neo-brutalism. Tokens in `Theme.swift` and `app/globals.css`, asserted
equal by `ThemeTests`:

| Token | Value | Use |
| --- | --- | --- |
| bg | `#0a0a0b` | ground |
| surface | `#151518` | cards, fields |
| fg | `#f4f1ea` | text and every border |
| muted | `#9a978f` | secondary text |
| accent | `#ff6b3d` | Vedic, primary actions |
| violet | `#7c6cff` | Western, the timeline |
| yellow | `#ffd23f` | numerology, the "In simple words" callout |

Borders are bone at full strength, 2pt. Shadows are a second rectangle
offset 4pt right and down, never blurred. Corners are 4pt. Headings are
black-weight; labels, dates and numbers are monospaced. Buttons press by
dropping onto their own shadow. The components are in `Components.swift`:
`brutCard`, `brutBordered`, `BrutButtonStyle`, `BrutChip`, `BrutTag`,
`BrutSegmented`, `BrutProgressBar`, `ScreenHeader`, `BrutEmptyState`,
`BrutNotice`. The marketing landing page is unchanged.

The closing **In simple words** section of every reading is lifted into a
yellow callout, on both platforms, so the one part written for someone in a
hurry is the part that stands out.

## 4. Committed readings

The prompt now asks for predictions that state what (a concrete event),
when (a dated window written as months and years), and how sure (exactly
one of likely, possible, unlikely), picks the outcome the chart favours
rather than writing both, and answers yes/no questions in the first
sentence. To give the model dates to commit to, the volatile half of the
system prompt carries the user's age, the end of the current sub-period and
the next two, the next main-period change within eighteen months, and the
slow planets' upcoming sign changes and retrograde turns, computed from
transit charts sampled at 30, 90, 180 and 365 days out.

## 5. Crashes

Force unwraps on the network path (`geocode`'s URL, the multipart body),
in `ChatMode.next`, and on `TimeZone(identifier: "UTC")` were replaced with
guarded code. The chat store carries a generation counter so a flush or a
late network event from a superseded reading can never land in the current
one.
