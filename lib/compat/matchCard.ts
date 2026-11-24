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

/** The other thing that can follow the text: the reply failed and can be tried again. */
export const FAILED_MARK = `${CARD_SEPARATOR}{"type":"failed"}`;

/** A reply's text and what follows it, from as much of the stream as has arrived. */
export function splitCard(raw: string): { text: string; card: MatchCard | null; failed?: boolean } {
  const at = raw.indexOf(CARD_SEPARATOR);
  if (at === -1) return { text: raw, card: null };
  if (raw.slice(at) === FAILED_MARK) return { text: raw.slice(0, at), card: null, failed: true };
  const text = raw.slice(0, at);
  try {
    const card = JSON.parse(raw.slice(at + 1)) as MatchCard;
    return { text, card: card?.type === "match" && Array.isArray(card.places) ? card : null };
  } catch {
    return { text, card: null };
  }
}
