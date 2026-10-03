import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// Default readings run on Sonnet 5.5 (adaptive thinking for well-reasoned
// interpretation). "Deep reading" upgrades to Opus 5.5.
export const READING_MODEL = "claude-sonnet-5-5";
export const DEEP_READING_MODEL = "claude-opus-5-5";

// Both current models support adaptive thinking (Haiku 4.5 would not).
export function supportsAdaptiveThinking(model: string): boolean {
  return model === "claude-sonnet-5-5" || model === "claude-opus-5-5";
}

/**
 * How hard the model thinks before answering.
 *
 * Thinking tokens are billed as output, which is the expensive half of a
 * reading. Measured on a standard Vedic reading of the same chart and question:
 *
 *   adaptive, default effort   1,452 output tokens
 *   adaptive, effort "low"       719
 *   thinking disabled            328
 *
 * All three cited the same real placements, so `low` is where routine readings
 * sit: reasoning intact, spend halved. Deep readings keep the default, which is
 * what the user is asking for when they turn Deep on.
 *
 * `output_config` is GA but postdates the installed SDK's types, so the value
 * is cast to keep the wire format exact.
 */
export const LOW_EFFORT: { readonly output_config: { readonly effort: "low" } } = {
  output_config: { effort: "low" },
};

/**
 * A chat reading: enough thought to connect the question's houses, the
 * dasha lords and the dated sky before committing to an answer. Background
 * jobs (extraction, alerts) stay on {@link LOW_EFFORT}.
 */
export const READING_EFFORT: { readonly output_config: { readonly effort: "medium" } } = {
  output_config: { effort: "medium" },
};

/**
 * Deep readings. Set explicitly because Opus 5.5 defaults to "medium", one
 * level below what Deep used to get by omitting it.
 */
export const DEEP_EFFORT: { readonly output_config: { readonly effort: "high" } } = {
  output_config: { effort: "high" },
};

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}
