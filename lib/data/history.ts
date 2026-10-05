export type Turn = { role: "user" | "assistant"; content: string };

/**
 * How much past conversation to resend.
 *
 * The API is stateless, so every turn re-sends the history and is billed for
 * it. A budget in characters keeps a long reading from crowding out the last
 * few exchanges, and keeps the bill flat on conversations that run for hours.
 * Roughly four characters to a token, so 9,000 characters is ~2,250 tokens.
 * Raised from 6,000 when answers became specific: a committed, dated reading
 * runs longer, and the turn it builds on has to still be in view.
 */
export const HISTORY_BUDGET_CHARS = 9000;

/**
 * Where a cache-stable window may start: every {@link ANCHOR_TURNS} stored
 * turns (three exchanges).
 */
export const ANCHOR_TURNS = 6;
/** How far past the budget an anchored window may run before it falls back to the plain one. */
export const ANCHOR_SLACK = 1.6;

/**
 * Picks the history to resend. With `cacheStable`, a conversation that has
 * outgrown the budget starts its window on a fixed anchor (every six stored
 * turns) at or before where the plain window would start. The plain window
 * slides by a turn every message, which changes the first message of the
 * prefix and makes every turn of a long chat a full cache miss; the anchored
 * one holds still for three exchanges, so those turns read the whole history
 * from cache at a tenth of the input price. It only ever keeps more than the
 * plain window, never less, so no reading loses context to it.
 */
export function selectHistory(
  turns: Turn[],
  budget: number = HISTORY_BUDGET_CHARS,
  options: { cacheStable?: boolean } = {},
): Turn[] {
  const plain = plainWindow(turns, budget);
  if (!options.cacheStable) return plain;
  const plainStart = turns.length - plain.length;
  if (plain.length === 0 || plainStart === 0) return plain;

  let start = Math.floor(plainStart / ANCHOR_TURNS) * ANCHOR_TURNS;
  while (start < plainStart && turns[start].role === "assistant") start++;
  if (start >= plainStart) return plain;
  const size = turns.slice(start).reduce((sum, t) => sum + t.content.length, 0);
  return size <= budget * ANCHOR_SLACK ? turns.slice(start) : plain;
}

function plainWindow(turns: Turn[], budget: number): Turn[] {
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
