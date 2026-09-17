# Siri, widgets, and on-device answers

Three features share one mechanism: the chart lives on the phone, so Siri, the
widget, and the chat can all answer from it without a network call, a session,
or a paid API request.

- **On-device answers.** Questions that are lookups — "where's my Saturn",
  "what's in my seventh", "which dasha am I in" — are answered by Apple's
  on-device model reading the local chart. Free, instant, offline, and the
  question never leaves the phone.
- **Siri and Shortcuts.** Five phrases work the moment the app is installed.
- **Widget and Control Center.** Today's reading on the Home and Lock Screens,
  and a Control Center button that opens the kundli.

## 1. Enable App Groups (required)

Without this the widget shows its empty state forever and Siri says there is no
chart — the app and the extension are looking at two different containers.

1. <https://developer.apple.com/account/resources/identifiers> → **Identifiers**
   → **App Groups** → **+**, and register:

   ```
   group.com.shivvyas.astra
   ```

2. Open the **app** identifier `com.shivvyas.astra`, enable **App Groups**, and
   tick the group above.
3. Register a second App ID for the widget, `com.shivvyas.astra.widgets`, and do
   the same.
4. Xcode → **Signing & Capabilities** → let it regenerate both profiles.

`mobile/project.yml` already declares the entitlement on both targets, so
`xcodegen generate` picks it up. Nothing else in the project needs changing.

## 2. Apple Intelligence (for the free answers)

On-device answers need iOS 26 or later, a device that supports Apple
Intelligence, and the setting switched on. Where any of that is missing, every
question goes to Claude exactly as it did before — the feature degrades rather
than disappearing, and the profile screen says which state the device is in.

There is nothing to configure. `FoundationModels` is weak-linked behind
`#if canImport`, so the app still builds and runs on iOS 17.

### The constraint worth knowing about

**Apple's on-device model refuses astrology.** Asked to act as an astrologer's
assistant it returns a guardrail error; asked to restate a table of positions it
answers well. Everything the model is shown is therefore framed as a plain
reference table — see `ChartFacts` — and not one word of it names a graha, a
house, a rashi, or the practice. `OnDeviceRoutingTests` asserts this, because if
the framing slips the feature stops answering silently.

## 3. What Siri can do

| Say | What happens |
| --- | --- |
| "What's my Sanchara reading" | Reads back the latest reading. No app launch. |
| "Show my Sanchara reading" | Same, as a card. iOS 26+. |
| "What dasha am I in on Sanchara" | Reads the current mahadasha and antardasha. |
| "Where is my Saturn in Sanchara" | Reads one placement. |
| "Ask Sanchara about my chart" | Free-form. Lookups answer on-device; anything interpretive is queued and the app picks it up. iOS 26+. |
| "Open my Sanchara kundli" | Opens the chart. |

Every phrase must contain the app name — that is an App Intents rule, not a
stylistic choice, and the token also covers users who rename the app.

**No intent ever commissions a new reading.** An intent that spent money or took
thirty seconds would be a bad thing to have wired to a voice phrase, so intents
only hand back readings that already exist.

## 4. Testing it

The simulator has no Apple Intelligence, so on-device answers cannot be
exercised there; the routing either side of the model is covered by
`OnDeviceRoutingTests`.

```sh
cd mobile
xcodegen generate
xcodebuild -project Sanchara.xcodeproj -scheme Sanchara \
  -destination 'platform=iOS Simulator,name=iPhone 17' test
```

For Siri and the widget you need a device:

- **Shortcuts app** → the Sanchara shortcuts appear under the app, with no
  setup. If they do not, the App Shortcuts provider did not register — check
  that the build actually installed rather than just compiled.
- **Widget**: long-press the Home Screen → **+** → Sanchara. It draws from the
  cache, so open the app once first.
- **Control Center**: edit controls → **Sanchara** → Open kundli.

## 5. What is cached, and when it is cleared

`ChartCache` writes three things into the app group: the chart, the birth
details, and the most recent reading. No tokens and no session — those stay in
the keychain.

All three are deleted on sign-out. A birth chart outliving the account that owns
it would mean the next person to sign in on a shared device sees a stranger's
reading on the Lock Screen.

## 6. On-device lookups, verified against the model

**Status: NOT YET RUN.** This gate must pass before the enriched on-device
table ships. It cannot be automated and it cannot be run on a Mac.

The on-device model refuses anything it reads as fortune telling. The neutral
vocabulary in `ChartFacts.swift` — "section" for house, "controlled by" for
lord, "strength rating" for dignity — was arrived at by testing against the
real model, not by reasoning. The table has since grown a dozen new row types,
and that is exactly the kind of change that can trip the guardrail back into
"May contain sensitive content".

`SuggestionEngine.isOnDeviceAvailable` is false on CI and on any Mac, and the
model's answers are not deterministic, so no test can stand in for this.

### Running it

1. Build to a physical device with Apple Intelligence enabled. Confirm on the
   profile screen that the status reads "On, generating suggestions on this
   device". Any other status means the gate cannot be run there.

2. In Vedic mode, ask each of these and record the answer verbatim:

   1. who is the lord of my 7th house
   2. which planet rules my 10th
   3. is my Venus exalted
   4. is my Mercury combust
   5. what does my Saturn aspect
   6. which dasha am I in and where is its lord

3. Check each answer against three conditions:

   - It was answered **on device** — the transcript labels it, and
     `ChatStore.canExpandLastAnswer` is true.
   - It was **not refused**. A refusal reads as "May contain sensitive
     content" or a flat decline.
   - It **restates the table** rather than interpreting it.

### Deciding

All six pass: the on-device work ships.

Any refusal: the vocabulary has not gone far enough. Find the word that
triggered it, replace it with a plainer one, and repeat from step 2. Do **not**
loosen the guardrails — `permissiveContentTransformations` is already in use
and there is nothing above it.

Any answer that interprets rather than restates: sharpen the restatement rule
in `OnDeviceReasoner.answer`. That is a prompt change in that file, not a
change to the table.

### Record the result here

Replace this section's status line and paste the six questions with their
verbatim answers. That record is how the next person learns what the model
actually accepts, which is the thing these comments say was expensive to find.
