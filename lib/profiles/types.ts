/**
 * The other people in a user's life — a partner, a parent, a friend — saved
 * with their own chart so Astrya can compare it with the user's.
 * See supabase/migrations/0012_people_and_birth_time.sql.
 */

export const RELATIONSHIPS = [
  "partner",
  "spouse",
  "crush",
  "friend",
  "parent",
  "child",
  "sibling",
  "colleague",
  "other",
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];

export function isRelationship(value: unknown): value is Relationship {
  return typeof value === "string" && (RELATIONSHIPS as readonly string[]).includes(value);
}

/** How each relationship reads on a pill. */
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  partner: "Partner",
  spouse: "Spouse",
  crush: "Crush",
  friend: "Friend",
  parent: "Parent",
  child: "Child",
  sibling: "Sibling",
  colleague: "Colleague",
  other: "Other",
};

/**
 * Anti-abuse ceiling, matched by a trigger in 0012. Not a plan limit — there
 * is none — just a number no real person reaches.
 */
export const PEOPLE_CEILING = 200;

export type PersonRow = {
  id: string;
  owner_id: string;
  label: string;
  relationship: Relationship;
  first_name: string;
  last_name: string;
  birth_date: string;
  birth_time: string;
  birth_time_known: boolean;
  place_name: string;
  lat: number;
  lng: number;
  timezone: string;
  chart: { vedic: unknown; western: unknown } | null;
  created_at: string;
  updated_at: string;
};

/** What a list shows: everything but the chart, plus the two signs worth a glance. */
export type PersonSummary = Omit<PersonRow, "chart" | "owner_id"> & {
  moonSign: string | null;
  sunSign: string | null;
};
