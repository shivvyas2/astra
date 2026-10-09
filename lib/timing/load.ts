import "server-only";
import { DateTime } from "luxon";
import type { Db } from "@/lib/supabase/route";
import { loadBirthRow, loadTimeline } from "@/lib/timeline/load";
import { personalTiming, type TimingEvent } from "./engine";
import { skyEvents } from "./sky";

export type Timing = { today: string; horizonEnd: string; events: TimingEvent[] };

/** The signed-in user's dated windows for the next year, or null before intake. */
export async function loadTiming(db: Db, months = 12): Promise<Timing | null> {
  const birth = await loadBirthRow(db);
  const natal = birth?.chart?.vedic;
  if (!birth || !natal) return null;
  const today = DateTime.utc().toISODate()!;
  const horizonEnd = DateTime.fromISO(today).plus({ months }).toISODate()!;
  const [sky, timeline] = await Promise.all([skyEvents(today, months), loadTimeline(db, birth)]);
  return { today, horizonEnd, events: personalTiming({ natal, sky, periods: timeline?.periods, today, horizonEnd }) };
}
