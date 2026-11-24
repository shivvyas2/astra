import type { GeoResult } from "@/lib/geo";
import type { Relationship } from "@/lib/profiles/types";

/**
 * The confirm card, and how it travels: after the reply's text in the same
 * stream, behind one U+001E. Client-safe. Sent only to a client that asked
 * for cards, and never stored with the transcript.
 */
export type MatchCard = {
  type: "match";
  name: string;
  relationship: Relationship;
  birthDate: string | null;
  /** The other way to read an ambiguous date; they must choose. */
  altBirthDate: string | null;
  birthTime: string | null;
  timeKnown: boolean;
  /** Best first. Empty on a card opened with nothing known. */
  places: GeoResult[];
  /** Nothing tells the first places apart; they must choose. */
  placeAmbiguous: boolean;
};

export const CARD_SEPARATOR = "\u001e";

/** A reply's text and its card, from as much of the stream as has arrived. */
export function splitCard(raw: string): { text: string; card: MatchCard | null } {
  const at = raw.indexOf(CARD_SEPARATOR);
  if (at === -1) return { text: raw, card: null };
  const text = raw.slice(0, at);
  try {
    const card = JSON.parse(raw.slice(at + 1)) as MatchCard;
    return { text, card: card?.type === "match" && Array.isArray(card.places) ? card : null };
  } catch {
    return { text, card: null };
  }
}
