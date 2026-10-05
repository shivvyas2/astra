export type Slot = "morning" | "night";

/**
 * When each of the day's two readings is delivered, in the user's own local
 * hours (start inclusive, end exclusive).
 *
 * The job runs every hour (`.github/workflows/cron.yml`), with the two Vercel
 * crons as a backstop, and each user is handled on their own clock. A slot is
 * written by the first run that lands inside its window, so the morning
 * reading arrives between 7 and 8 and the night one between 20 and 21,
 * whether the person is in Mumbai or New York. Between the windows nothing is
 * due, and the unique index on (user, date, slot) makes extra runs harmless.
 */
export const MORNING_WINDOW = { start: 7, end: 12 } as const;
export const NIGHT_WINDOW = { start: 20, end: 24 } as const;

/**
 * Pushes that are not tied to a slot (dosha alerts, discoveries) go out only
 * between these local hours, so nothing buzzes at 3am.
 */
export const WAKING_HOURS = { start: 8, end: 22 } as const;

/** Which slot a local hour falls in, or null between the windows. */
export function slotForHour(localHour: number): Slot | null {
  if (localHour >= MORNING_WINDOW.start && localHour < MORNING_WINDOW.end) return "morning";
  if (localHour >= NIGHT_WINDOW.start && localHour < NIGHT_WINDOW.end) return "night";
  return null;
}

/** The slot this user still needs right now, or null when nothing is due. */
export function isSlotDue(localHour: number, alreadyWritten: Slot[]): Slot | null {
  const slot = slotForHour(localHour);
  if (!slot || alreadyWritten.includes(slot)) return null;
  return slot;
}

export function isWakingHour(localHour: number): boolean {
  return localHour >= WAKING_HOURS.start && localHour < WAKING_HOURS.end;
}
