/**
 * Anthropic list prices, USD per million tokens, first-party API.
 *
 * Cache writes are billed by TTL: 1.25x input for the 5-minute cache, 2x for
 * the 1-hour cache (the chart block uses 1h, the conversation breakpoint 5m).
 * Cache reads are a per-model fraction of input. Source: the Claude API
 * pricing table as of 2026-09; see docs/MODEL_COSTS.md. Update here when
 * prices change: rows already written keep the cost they were billed at.
 */
export type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
};

const price = (input: number, output: number, cacheRead: number): ModelPrice => ({
  input,
  output,
  cacheRead,
  cacheWrite5m: input * 1.25,
  cacheWrite1h: input * 2,
});

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": price(4, 20, 0.2),
  "claude-opus-5": price(5, 25, 0.5),
  "claude-sonnet-5-5": price(2, 10, 0.2),
  "claude-sonnet-5": price(2, 10, 0.2),
  "claude-sonnet-4-6": price(3, 15, 0.3),
  "claude-haiku-4-5": price(1, 5, 0.1),
};

/** The price row for a model id, tolerating a dated suffix. Null when unknown. */
export function priceFor(model: string): ModelPrice | null {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  const base = Object.keys(MODEL_PRICES).find((id) => model.startsWith(`${id}-`));
  return base ? MODEL_PRICES[base] : null;
}

/** Token counts for one call, already split by how each is billed. */
export type TokenCounts = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
};

/** USD for one call, rounded to the column's six decimals. 0 for an unknown model. */
export function costUsd(model: string, t: TokenCounts): number {
  const p = priceFor(model);
  if (!p) return 0;
  const usd =
    (t.input * p.input +
      t.output * p.output +
      t.cacheRead * p.cacheRead +
      t.cacheWrite5m * p.cacheWrite5m +
      t.cacheWrite1h * p.cacheWrite1h) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
