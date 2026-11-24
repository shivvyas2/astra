/**
 * The AI could not write this. Nothing canned goes out in its place: the
 * caller stores and sends nothing, and the next run tries again.
 */
export class AiUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`AI unavailable: ${reason}`);
    this.name = "AiUnavailable";
  }
}

/** Failures in a row, with nothing written, after which a run stops trying. */
export const GIVE_UP_AFTER = 3;
