export type Slot = "morning" | "night";

/**
 * Which of the day's two readings a moment belongs to.
 *
 * The job runs on a fixed UTC schedule but users are in their own timezones, so
 * the slot is decided by the user's local clock, not the server's: anything
 * before 14:00 local is that day's morning reading, anything after is that
 * night's. Pairing this with a unique index on (user, date, slot) means the job
 * can run as often as you like — extra runs simply find the slot already
 * written and do nothing.
 */
export const NIGHT_STARTS_AT_HOUR = 14;

export function slotForHour(localHour: number): Slot {
  return localHour < NIGHT_STARTS_AT_HOUR ? "morning" : "night";
}

/** Whether this user still needs the reading for the slot they are currently in. */
export function isSlotDue(localHour: number, alreadyWritten: Slot[]): Slot | null {
  const slot = slotForHour(localHour);
  return alreadyWritten.includes(slot) ? null : slot;
}
