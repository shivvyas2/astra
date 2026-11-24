import type { UsageLike } from "./record";

/** Two calls' usage as one, for a reading that took more than one call. */
export function addUsage(a: UsageLike | null, b: UsageLike | null | undefined): UsageLike | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const sum = (x?: number | null, y?: number | null) => (x ?? 0) + (y ?? 0);
  return {
    input_tokens: sum(a.input_tokens, b.input_tokens),
    output_tokens: sum(a.output_tokens, b.output_tokens),
    cache_read_input_tokens: sum(a.cache_read_input_tokens, b.cache_read_input_tokens),
    cache_creation_input_tokens: sum(a.cache_creation_input_tokens, b.cache_creation_input_tokens),
    // Only when both carry the breakdown; otherwise the total is billed.
    ...(a.cache_creation && b.cache_creation
      ? {
          cache_creation: {
            ephemeral_5m_input_tokens: sum(a.cache_creation.ephemeral_5m_input_tokens, b.cache_creation.ephemeral_5m_input_tokens),
            ephemeral_1h_input_tokens: sum(a.cache_creation.ephemeral_1h_input_tokens, b.cache_creation.ephemeral_1h_input_tokens),
          },
        }
      : {}),
  };
}
