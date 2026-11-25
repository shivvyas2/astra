# Look-ups and drawn charts in chat

Approved in conversation, 2026-11-25 (option A, with drawn charts and muhurat added).

## Why
People asked for D9, D7, dasha dates past the current period, Sade Sati ends,
ashtakavarga, muhurat and a drawn chart, and were told Astrya does not have them.

## What it does
- A Vedic reading can call `look_up` for D2 to D60, every dasha date, Sade Sati
  and Dhaiya dates, ashtakavarga, and muhurat or a day's panchang, for the
  person or a match already in the conversation. Code computes, the model words.
- A chart asked for by name or asked to be seen is drawn above the answer, and
  again when the reading is reopened.
- Without a birth time: no divisional charts or ashtakavarga, dasha dates marked
  approximate, the birth chart drawn from the Moon. Near an ascendant's edge, a
  divisional chart says how few minutes would change it.
- The account's own birth year must make them 13 (Terms); a year that makes them
  under 5 is pointed out in chat. A profile saved again part way through a chat
  is told to the model, so it does not apologise for the old chart.

## Approaches
1. **A look-up tool, called when needed (chosen).** A second model call, only on
   questions that need one.
2. Everything in every prompt: simplest, dearer on every reading.
3. Matching words like "D9": free, misses "how many kids?" and mixed languages.

## How
- `lib/astrology/{vargas,ashtakavarga,saturn}.ts`, `lib/panchang/`, `lib/lookups/`.
  Divisional charts and ashtakavarga come from the stored positions: no migration.
- A drawn chart is plain lines in the reply (`lib/lookups/chartBlock.ts`), so old
  apps show a list, new ones draw it, and nothing new is stored. It is taken out
  of the history the model reads, so the model never writes one itself.
- Ashtakavarga uses the Brihat Jataka rows; other editions place four rows differently.
- Muhurat hours are daylight choghadiyas clear of Rahu Kaal and Bhadra. Weddings
  and house entries keep out of Kharmas, Chaturmas, adhika months and Jupiter or
  Venus combust.

## Not included
Western and numerology look-ups, night muhurats and lagna shuddhi, birth-time
rectification, regional muhurat rules.
