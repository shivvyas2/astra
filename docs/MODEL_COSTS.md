# What a reading costs, and why it costs that

Every number here was measured against the real API on a real chart
(Ahmedabad, 1995) asking a real question, not estimated.

## Where the money goes

A turn is billed on three things: input tokens (the prompt plus the whole
conversation so far, re-sent every turn because the API is stateless), thinking
tokens, and the visible answer. Thinking and answer are both billed at the
**output** rate, which is 5× the input rate — so thinking, not prompt size, was
the biggest lever.

| | Before | After |
|---|---|---|
| System prompt | 1,608 tokens | 942 |
| System + 10-turn history | 4,017 tokens | 2,868 (8 turns kept) |
| Input billed from turn 2 on | 4,017 at full rate | 2,867 as **cache read** (0.1×) |
| Output on a standard reading | 1,452 tokens | 719 |

Sonnet 5 at $2/M in, $10/M out: a mid-conversation turn went from roughly
$0.023 to $0.008, and the reading itself did not get shorter — 167 words before,
169 after.

## The four changes

**1. Prompt caching, which required making the prompt hold still.**
The system prompt is built in two halves (`lib/astrology/prompt.ts`):
`buildChartSystem` — the chart and the rules, byte-identical for a user forever
— then `buildTodaySystem` — the date, the sky, the length rule. A cache
breakpoint sits after the first half, and a second after the last stored turn,
so from a conversation's second message the entire prefix is a cache read.

Two things used to change on every single request and had to stop:

- The date line carried a clock time (`9:41 AM`), so the prompt differed every
  minute. It is now the date plus a part of day.
- Transits were computed for *now*. They are now computed for midday UTC and
  memoised per day per neighbourhood (`lib/astrology/transits.ts`), which also
  stops the ephemeris running on every message.

A prefix below the API's minimum (1,024 tokens on Sonnet) is silently not
cached, which is why the conversation breakpoint, not the system one, does the
real work.

**2. Effort.** Thinking tokens are billed as output. On the same reading:

```
adaptive, default effort   1,452 output tokens
adaptive, effort "low"       719
thinking disabled            328
```

All three cited the same real placements. Routine readings ran at `low` for
a while; since 2026-10-03 they run at `effort: "medium"` (`READING_EFFORT` in
`lib/anthropic.ts`) on Sonnet 5.5, and Deep readings at `high` (`DEEP_EFFORT`)
on Opus 5.5. That is a deliberate spend: the owner chose better-reasoned,
more personal predictions over the saving, and it is not to be walked back.
`LOW_EFFORT` is kept for the background jobs that only summarise facts: the
dosha alerts (once per user per day on Opus, `max_tokens` cut from 4,096 to
1,600) and the memory pass on the server.

`thinking: { type: "disabled" }` on the non-deep path would take output to
~328 tokens, a quarter of the original. It is listed here only so nobody
rediscovers it: chart work needs the reasoning.

**3. A history budget.** `selectHistory` (`lib/data/history.ts`) re-sends the
most recent turns up to 9,000 characters instead of a flat last-10, so one long
reading cannot crowd out the recent exchange and a conversation that runs all
evening does not keep getting more expensive.

**4. An explicit length rule.** The prompt asks for 190 words (360 on Deep)
rather than "be concise", which is what actually governs output spend.
`max_tokens` is now 1,600 / 3,000 — a ceiling, not a target.

## The memory pass, and where it runs

After a reading finishes, one pass keeps three kinds of memory current: the
standing facts (`user_facts`, from what the user said), the conversation's
rolling summary (`conversation_memories`), and the dated predictions the
reading made (`predictions`). It runs in one of two places.

**On an iPhone with Apple Intelligence, on the device.** The chat request
carries `memory: "on-device"`, the server skips its pass, and the phone's
on-device model (guided generation into `ConversationNotes`,
`mobile/Sanchara/Sources/Features/Chat/OnDeviceMemory.swift`) writes the notes
and posts them to `/api/memory/ingest`, which validates them and writes them
under RLS. **$0 in model spend.** If the on-device model cannot run (a refusal,
assets not downloaded), the phone asks the server to run its pass for that turn
instead, so the turn is billed as below rather than lost.

**Everywhere else, one Claude Haiku 4.5 call** (`lib/memory/extract.ts`,
`claude-haiku-4-5`, $1/M in, $5/M out, JSON-schema-constrained, no thinking).
One call returns facts, summary, topics and predictions together; three
separate calls would have paid for the rules and the reading three times.

- Input: the rules (~1,000 tokens when the message can hold a fact, ~500 when
  it cannot; then the facts list is left out too), the facts on file (up to
  40, ~15 tokens each), the conversation's summary so far (~100), the message,
  and the reading (~350). Roughly 1,000 to 2,300 tokens.
- Output: a summary (~100 tokens), topics, zero to three predictions (~40
  each) and usually no fact changes. Roughly 150 to 300 tokens.
- **About $0.002 to $0.004 per turn.** Below Haiku's 4,096-token minimum
  cacheable prefix, so it is not cached. Every turn that produced a reading
  runs it, because every reading can move the summary and most make a dated
  prediction; v1 skipped turns with no first-person words because it only
  looked for facts.

Each server pass logs `memory usage model=claude-haiku-4-5 in=… out=…`. An
iPhone turn logs nothing, which is the point.

## Memory in the reading's prompt

`lib/memory/select.ts` picks what a reading sees instead of sending every
fact, and holds all of it under **600 tokens** (four characters a token,
erring high), guidance included:

- **Standing notes, up to ~440 tokens**, in a system block after the cached
  chart: the core facts (work, relationships, home, two each), the three most
  recent other conversations, and predictions due now. It depends only on what
  is stored, never on the question, so within a conversation it is identical
  turn to turn and is a cache read (0.1x) from the second turn, like v1's
  facts block.
- **A question note, up to ~160 tokens**, as a text block ahead of the newest
  user message: facts, older summaries and predictions on the topics the
  question names (keyword and house-number matching, no model call). It sits
  after the conversation's cache breakpoint and is never stored, so it never
  costs the cache. At full Sonnet input price it is at most ~$0.0003 a turn,
  and it is empty for a question that names no topic.

## Per turn, before and after

Sonnet 5.5 reading, mid-conversation. The reading itself (~$0.008) is
unchanged in all three columns; these are the memory costs on top. Estimated
from token counts, not yet measured in production.

| | v1 (facts only) | Now, server pass | Now, iPhone on-device |
|---|---|---|---|
| Memory model call | $0 to $0.002, skipped on most chart questions | ~$0.002 to $0.004, every reading turn | **$0** |
| Memory in the prompt | 150 to 800 tokens, cached from turn 2 | at most 600 tokens: ~440 cached, ~160 fresh | same |
| Memory cost per turn | ~$0.0005 to $0.002 | ~$0.002 to $0.004 | **~$0.0001 to $0.0004** |
| What is remembered | facts | facts, summaries, predictions | facts, summaries, predictions |

The server path costs a little more per turn than v1 because it now remembers
three things on every turn instead of facts on some. The iPhone path remembers
the same three things for close to nothing, and "what do you know about me?"
there costs nothing at all: it is answered from the notes the phone already
fetched.

## Watching it in production

Every turn logs one line:

```
chat usage conv=<id> model=claude-sonnet-5-5 in=13 cache_write=0 cache_read=2867 out=538
```

`cache_read` staying at 0 across a conversation means something reintroduced a
per-request change into the prompt prefix — check the date line and the transit
text first.

## The cheapest turn is the one that never reaches the API

Everything above makes a paid turn cheaper. The iOS app goes one step further
and stops some turns being paid at all.

A large share of what people ask is not interpretation — "where's my Saturn",
"what's in my seventh", "which dasha am I in". Each of those was a full Claude
call answering from a chart the phone could have read itself. `OnDeviceReasoner`
(`mobile/Sanchara/Sources/Features/Chat/OnDeviceReasoner.swift`) routes them to
Apple's on-device model instead:

1. A string check. A question naming no graha, house, or period cannot be a
   lookup, and never costs a model call at all.
2. A `@Generable Bool` classification on-device: is this retrieval, or a request
   for meaning?
3. If retrieval, the on-device model answers through a tool that reads the local
   chart. **$0.** If not, the turn goes to Claude exactly as before.

Two things keep it honest. The tool records whether it was called, and an answer
composed without a single lookup is discarded rather than shown — that is the
guard against a confident invented placement. And every locally-answered turn is
labelled in the transcript with a one-tap "Ask for a full reading", so a
misrouted question costs a tap, not a wrong answer.

The saving is not in the per-turn price, which was already $0.008 — it is in the
turn count. Whether that is a third of turns or a tenth depends entirely on how
people use it, so it is worth reading `chat usage` line counts before and after
rather than trusting an estimate here.

This needs iOS 26 and Apple Intelligence. Everywhere else, every turn is a paid
turn, exactly as documented above. See `docs/SIRI_AND_WIDGETS.md`, in particular
the note on why nothing shown to the on-device model may name astrology.

## What is never done to save money

Astrya has no usage limits: no daily or monthly caps, no 429s, Deep readings
open to everyone, no plan gating. Cost is handled on this side only, with the
levers above (caching, the on-device and Haiku side passes, deduping repeated
requests). Lowering reading effort, swapping the reading model for a cheaper
one, shortening answers or trimming history are off the table because each
one lowers the reading. Heavy use is made visible in the admin dashboard
("Heavy use" flags, top spenders, cost per reading), never blocked.
