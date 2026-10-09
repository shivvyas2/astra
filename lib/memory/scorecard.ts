import type { Prediction } from "./types";

/**
 * Astrya's record with one person: of the dated predictions its readings made,
 * how many they said came true.
 *
 * Only the person's own answers count. "Not sure" is kept out of the rate
 * rather than counted either way, and no rate is shown until there are enough
 * answers for it to mean something — a 100% from one prediction is noise
 * dressed up as a claim. Mirrored in the app by `Scorecard` in
 * KnowledgeStore.swift; keep the two in step.
 */
export const MIN_CHECKED_FOR_RATE = 3;

export type Scorecard = {
  happened: number;
  didnt: number;
  unsure: number;
  /** happened + didnt: the answers the rate is taken over. */
  checked: number;
  /** Rounded percentage of `checked` that happened, or null below MIN_CHECKED_FOR_RATE. */
  rate: number | null;
  /** The predictions it called "likely", and how many of those happened. */
  likely: { checked: number; happened: number };
  /** Open, and its window has begun: waiting for the person to say. */
  awaiting: number;
  /** Open, and its window is still ahead. */
  upcoming: number;
  total: number;
};

export function scorecard(predictions: Prediction[], today: string): Scorecard {
  let happened = 0, didnt = 0, unsure = 0, awaiting = 0, upcoming = 0, likelyChecked = 0, likelyHappened = 0;
  for (const p of predictions) {
    if (p.status === "happened") happened += 1;
    else if (p.status === "didnt") didnt += 1;
    else if (p.status === "unsure") unsure += 1;
    else if (p.window_start <= today) awaiting += 1;
    else upcoming += 1;
    if (p.confidence === "likely" && (p.status === "happened" || p.status === "didnt")) {
      likelyChecked += 1;
      if (p.status === "happened") likelyHappened += 1;
    }
  }
  const checked = happened + didnt;
  return {
    happened,
    didnt,
    unsure,
    checked,
    rate: checked >= MIN_CHECKED_FOR_RATE ? Math.round((happened / checked) * 100) : null,
    likely: { checked: likelyChecked, happened: likelyHappened },
    awaiting,
    upcoming,
    total: predictions.length,
  };
}
