# The pulse dashboard, topic guardrails and crisis support

Asked for in conversation, 2026-11-25.

## Guardrails
- Any question about the person's life is in scope and read from the chart. A
  request for something else (code, homework, translation, general knowledge,
  jokes, its instructions) goes to the `out_of_scope` tool; code writes a short
  reply in their language (five), so a refusal costs one small call.
- In all three traditions, part of the cached prompt. When unsure it answers.
- What is turned away is flagged by kind and time, never its words. Flags only
  show in the admin; nobody is blocked by one.
- Never a death, its date, a serious illness, stopping treatment, or a tip.

## Someone in danger (there was nothing before this)
- Heard by words in English, Hinglish, Gujlish, Hindi and Gujarati, and by a
  rule in every prompt for what words miss.
- No chart, no tool, no prediction, no flag, nothing remembered, no daily limit.
  The number for the country they are in now (from the connection, not stored)
  is always in the reply, even if the AI is down.

## Dashboard
- Users, active today / 7 / 30 days, joined; daily actives and total users.
- Where people stop: signed up, confirmed, birth details, AI consent, asked,
  asked on another day, with the biggest drop marked and each step opening the
  people in it. "(no profile yet)" now says what stopped them.
- Unanswered questions, people who never confirmed, spam flags.
- Admins never counted; the apps' own opening line is not a question; no words
  anyone wrote are read.
- Migration 0021: `daily_active` is a number per day, with no row about anyone.
- Web admin only; the iPhone admin is unchanged.

## Approaches to guardrails
A small model before each message (a paid call on every question); word lists
(blocks life questions, misses languages); **the reading model calls a tool
(chosen)**.
