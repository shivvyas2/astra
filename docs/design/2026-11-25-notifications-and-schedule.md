# Notifications people open, and a schedule that keeps time

Asked for in conversation, 2026-11-25: spicier and more engaging, "spicy but
true"; a week without opening Astrya and they stop; CI and the hourly job fixed.

## Why
Titles repeated ("Steady...", "A quiet day..."), read like a transit table, and 4
of 117 were opened. The hourly job ran three or four times a day. First alerts
said natal doshas were "now active".

## What it does
- A hook about the person's life, answered in the reading. Astrology stays off
  the lock screen. `lib/alerts/voice.ts` holds the rules and checks each line;
  one that breaks them is rewritten once, and a forbidden one is never sent.
- It draws on their own history in Astrya: recent questions, predictions falling
  due, dated changes ahead, where the Moon is today, and their last ten titles so
  the next one differs. Never other apps (Apple does not allow it), never mood
  check-ins, no health facts.
- Off the lock screen: names, places, sums, anything confided, clock times.
  Someone who has shared pain gets a plain, kind line with no hook.
- Seven days without a visit and nothing is written, sent or paid for. A visit
  starts it again (`lib/alerts/audience.ts`, migration 0020: one timestamp).
- What someone was born with is never said to have begun.

## Schedule and CI
- Vercel Schedules runs the job hourly (`vercel.json`), up to 15 minutes late on
  the free plan. GitHub's workflow stays as backstop and outage email.
- CI and the TestFlight workflow use GitHub's `xcode-27` image, the Xcode the app
  ships with.

## Approaches
Prompt changes alone (chosen before, drifted back to the same words); rotating
templates (repeat by design); **rules, a check in code and the person's own
history (chosen)**.
