import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// Default readings run on Haiku (fast + cheap; a chart interpretation is a short task).
// "Deep reading" upgrades to Opus with adaptive thinking.
export const READING_MODEL = "claude-haiku-4-5";
export const DEEP_READING_MODEL = "claude-opus-4-8";

// Haiku 4.5 does not support adaptive thinking; only the deep (Opus) model does.
export function supportsAdaptiveThinking(model: string): boolean {
  return model === DEEP_READING_MODEL;
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}
