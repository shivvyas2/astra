# Outage alarm, retry, and birth details before consent

Agreed in conversation, 2026-11-24. Alerts go out by email only, never as a push.

## Outage
Production AI calls can fail while every job still reports success, because
each composer falls back to canned text. From now on:
- **No canned readings.** A composer that cannot write returns null. Nothing is
  stored or pushed, and the next run inside the window tries again. A run gives
  up after three failures in a row.
- **Alarm.** The scheduled endpoint answers 503 when AI is down. The workflow
  fails and GitHub emails the repository owner. The body holds counts, a time
  and an error type only: Actions logs of a public repository are public.
- **Dashboard banner**, from the same check (`lib/health/ai.ts`).
- "Down" means: this run tried and nothing worked, or two or more questions
  have gone unanswered since the last successful call.

Alternatives: an email provider (another account and key to keep), or a push
(declined). GitHub already emails on a failed scheduled run.

## Retry
A failed reply ends with a marker behind U+001E for clients that send
`cards: true`, and shows "Try again". So does a reopened conversation whose
last question has no answer. The server treats a message identical to a
trailing unanswered one as the same question and does not store it twice.

## Onboarding order
Sign in, birth details, kundli, and the AI notice only when Ask is opened. The
chart needs no AI. Every AI route still refuses without consent on the server.
"Not now" leaves the rest of the app usable. Web pages that need a chart send
someone without one to birth details; so does saving another person.
