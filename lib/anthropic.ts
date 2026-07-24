import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// Default readings run on Sonnet 5 (intelligent + stable, with adaptive thinking for
// well-reasoned interpretation). "Deep reading" upgrades to Opus 4.8.
export const READING_MODEL = "claude-sonnet-5";
export const DEEP_READING_MODEL = "claude-opus-4-8";

// Both current models support adaptive thinking (Haiku 4.5 would not).
export function supportsAdaptiveThinking(model: string): boolean {
  return model === "claude-sonnet-5" || model === "claude-opus-4-8";
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}
