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

All three cited the same real placements, so routine readings run at
`effort: "low"` (`LOW_EFFORT` in `lib/anthropic.ts`) and Deep readings keep the
default. Dosha alerts, which run once per user per day on Opus, also use low
effort with `max_tokens` cut from 4,096 to 1,600.

If you ever want the cheapest possible standard reading, swapping `LOW_EFFORT`
for `thinking: { type: "disabled" }` on the non-deep path takes output to ~328
tokens — a quarter of the original. It was not made the default because chart
work benefits from some reasoning.

**3. A history budget.** `selectHistory` (`lib/data/history.ts`) re-sends the
most recent turns up to 6,000 characters instead of a flat last-10, so one long
reading cannot crowd out the recent exchange and a conversation that runs all
evening does not keep getting more expensive.

**4. An explicit length rule.** The prompt asks for 160 words (320 on Deep)
rather than "be concise", which is what actually governs output spend.
`max_tokens` is now 1,600 / 3,000 — a ceiling, not a target.

## Watching it in production

Every turn logs one line:

```
chat usage conv=<id> model=claude-sonnet-5 in=13 cache_write=0 cache_read=2867 out=538
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
