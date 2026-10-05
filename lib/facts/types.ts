/**
 * Standing facts a user has told Astrya about their own life, and the
 * pieces of logic that are the same on the server, the web client and in
 * tests. Nothing here touches the network or the model.
 */

export const FACT_CATEGORIES = [
  "work",
  "relationships",
  "family",
  "health",
  "money",
  "home",
  "goals",
  "worries",
  "other",
] as const;

export type FactCategory = (typeof FACT_CATEGORIES)[number];

/** A row of `user_facts`, as the API and the prompt see it. */
export type UserFact = {
  id: string;
  fact: string;
  category: FactCategory;
  created_at: string;
  updated_at: string;
  /**
   * 0009 columns. Absent on a database without that migration, and read as
   * "stated", never confirmed, learned in chat.
   */
  confidence?: FactConfidence;
  last_confirmed_at?: string | null;
  source?: FactSource;
};

/** Said outright, or clearly implied ("my husband" implies married). */
export const FACT_CONFIDENCES = ["stated", "inferred"] as const;
export type FactConfidence = (typeof FACT_CONFIDENCES)[number];

/** Where a fact came from. Matches the check constraint in 0009_memory.sql. */
export const FACT_SOURCES = ["chat", "on_device", "intake", "manual"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export function isFactConfidence(value: unknown): value is FactConfidence {
  return typeof value === "string" && (FACT_CONFIDENCES as readonly string[]).includes(value);
}

/** Headings for the "What Astrya knows" list, in display order. */
export const CATEGORY_LABEL: Record<FactCategory, string> = {
  work: "Work",
  relationships: "Relationships",
  family: "Family",
  health: "Health",
  money: "Money",
  home: "Home",
  goals: "Plans and goals",
  worries: "On your mind",
  other: "Other",
};

/** Matches the check constraint in 0008_user_facts.sql. */
export const FACT_MIN_CHARS = 3;
export const FACT_MAX_CHARS = 280;

/** How many facts a user keeps. The oldest "other" goes first past this. */
export const MAX_FACTS = 40;

export function isFactCategory(value: unknown): value is FactCategory {
  return typeof value === "string" && (FACT_CATEGORIES as readonly string[]).includes(value);
}

/** Facts grouped by category in display order, newest first within each. */
export function groupFacts(facts: UserFact[]): { category: FactCategory; label: string; facts: UserFact[] }[] {
  return FACT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    facts: facts
      .filter((f) => f.category === category)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  })).filter((group) => group.facts.length > 0);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
