# Matching inside chat

Approved in conversation, 2026-11-24.

## Why
People type a partner's birth details into Ask and are told Astrya can only
read their own chart, though Guna Milan and synastry already exist. A second
chart reached a reading only when it was started from the match screen.

## What it does
- Asked to match or read someone, Ask shows a confirm card with the details it
  understood. Nothing is saved before the person confirms.
- Confirming saves the person, attaches them to the conversation, and asks the
  same match question the match screen asks. Follow-ups keep both charts.
- A missing date, time or place: Ask asks for just that. An unknown birth time
  is fine. A place or date that can be read two ways must be chosen.
- Someone already saved needs no card: their chart is used at once.
- A match question with no details opens an empty card.
- Clients that cannot draw a card (the iPhone app before this build) get the
  same details as text and match on a reply of "yes" in any language.

## Approaches
1. **The reading model raises the card through a tool (chosen).** Understands
   mixed languages and details spread over turns; no extra call on an ordinary
   question. The stream has to run a short tool loop.
2. A small model check before every message: simpler, slower, always paid for.
3. Word matching: free, misses most of what people actually type.

## How
- Tools (Vedic and Western only): `propose_match`, `confirm_match`,
  `use_saved_person`. Fixed order and content, so the cached prefix holds.
- The read-back is written by code, never by the model, and `confirm_match`
  takes no arguments: the details are parsed back out of Astrya's own last
  message. What was shown is exactly what is saved. No migration.
- The card travels after the text in the same stream, behind U+001E, only when
  the request says `cards: true`. It is never stored in the transcript.
- `personId` on an existing conversation attaches that saved person to it.

## Not included
Numerology mode, comparing three people, editing a saved person from chat.
