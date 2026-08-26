export type Turn = { role: "user" | "assistant"; content: string };

/**
 * How much past conversation to resend.
 *
 * The API is stateless, so every turn re-sends the history and is billed for
 * it. A budget in characters keeps a long reading from crowding out the last
 * few exchanges, and keeps the bill flat on conversations that run for hours.
 * Roughly four characters to a token, so 6,000 characters is ~1,500 tokens.
 */
export const HISTORY_BUDGET_CHARS = 6000;

export function selectHistory(turns: Turn[], budget: number = HISTORY_BUDGET_CHARS): Turn[] {
  const kept: Turn[] = [];
  let used = 0;

  // Newest first: the most recent exchange matters most for coherence.
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    const cost = turn.content.length;
    if (used + cost > budget && kept.length > 0) break;
    kept.unshift(turn);
    used += cost;
  }

  // The API requires the first message to be from the user, and a reply with
  // no question above it reads as a non sequitur anyway.
  while (kept.length > 0 && kept[0].role === "assistant") kept.shift();
  return kept;
}
