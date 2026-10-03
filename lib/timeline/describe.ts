import type { Timeline, TimelineEvent } from "./build";

/** More than this and the block stops being context and starts being a list. */
const MAX_MOMENTS = 30;

function when(e: TimelineEvent): string {
  if (e.precision === "year") return e.occurredOn.slice(0, 4);
  if (e.precision === "month") return e.occurredOn.slice(0, 7);
  return e.occurredOn;
}

/**
 * The timeline as the chat model should know it.
 *
 * Vedic readings get the current period and each moment's period, because
 * that is the question a dasha answers: "why was that year like that". Western
 * readings have no dashas, so they get the moments alone — what happened and
 * when is still worth knowing when someone asks about their life.
 *
 * Returns "" when there is nothing worth saying, so the caller can append it
 * to a system prompt unconditionally.
 */
export function describeTimelineForPrompt(
  timeline: Timeline,
  options: { tradition: "vedic" | "western" },
): string {
  const vedic = options.tradition === "vedic";
  const moments = [...timeline.events].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)).slice(0, MAX_MOMENTS);

  const lines: string[] = [];
  if (vedic && timeline.now) {
    const period = timeline.periods.find((p) => p.isCurrent);
    const span = period ? ` (${period.start.slice(0, 4)}–${period.end.slice(0, 4)})` : "";
    lines.push(
      `Now: ${timeline.now.lord} period${span}, ${timeline.now.antardasha} sub-period (${timeline.now.start.slice(0, 7)} to ${timeline.now.end.slice(0, 7)}).`,
    );
  }
  if (moments.length > 0) {
    lines.push("Moments:");
    for (const m of moments) {
      const period = vedic && m.mahadasha ? ` · ${m.mahadasha}–${m.antardasha ?? "?"}` : "";
      lines.push(`- ${when(m)} · ${m.title}${period}`);
    }
  }
  if (lines.length === 0) return "";

  const heading = vedic
    ? "LIFE TIMELINE (what they have told us happened, placed in their dasha periods):"
    : "LIFE TIMELINE (what they have told us happened):";
  return `\n\n${heading}\n${lines.join("\n")}`;
}

/** "2027-12" from "2027-12-15". */
const yearMonth = (iso: string) => iso.slice(0, 7);

/**
 * Whole months from `from` to `to`, to the nearest month. Plain arithmetic on
 * the ISO parts: a dasha boundary is a date, and "about 14 months" does not
 * need a calendar library to be right.
 */
function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.max(0, Math.round((ty - fy) * 12 + (tm - fm) + (td - fd) / 30));
}

/** `iso` moved forward by `months`; the day is kept, which is all a comparison needs. */
function plusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * The period changes ahead, dated, so a prediction can name its window.
 *
 * Always the current sub-period's end and the two sub-periods after it —
 * crossing into the next mahadasha when the current one is the last of its
 * parent — and the mahadasha change itself when it falls inside the horizon.
 * The sub-periods are not cut by the horizon: a Venus sub-period can run three
 * years, and "what comes after this" is worth knowing however far off it is.
 *
 * Phrased relative to `today`, so this belongs in the volatile half of the
 * prompt, not the cached one. Returns "" when the timeline has no current
 * period to count from.
 */
export function describeUpcomingPeriods(timeline: Timeline, today: string, horizonMonths = 18): string {
  const now = timeline.now;
  if (!now) return "";

  const lines: string[] = [];
  lines.push(
    `- Current sub-period: ${now.lord}–${now.antardasha} ends ${yearMonth(now.end)} ` +
      `(about ${monthsBetween(today, now.end)} months from now).`,
  );

  // Every sub-period in life order, each tagged with its parent, so the two
  // after the current one are found by position rather than by date maths.
  const all = timeline.periods.flatMap((p) => p.antardashas.map((a) => ({ parent: p.lord, ...a })));
  const at = all.findIndex((a) => a.parent === now.lord && a.lord === now.antardasha && a.start === now.start);
  const following = at >= 0 ? all.slice(at + 1, at + 3) : all.filter((a) => a.start >= now.end).slice(0, 2);
  for (const a of following) {
    lines.push(`- Next sub-period: ${a.parent}–${a.lord}, ${yearMonth(a.start)} to ${yearMonth(a.end)}.`);
  }

  const horizon = plusMonths(today, horizonMonths);
  const current = timeline.periods.find((p) => p.isCurrent);
  if (current && current.end <= horizon) {
    const next = timeline.periods[timeline.periods.indexOf(current) + 1];
    const begins = next ? `; ${next.lord} begins` : "";
    lines.push(`- Main period changes: ${current.lord} ends ${yearMonth(current.end)}${begins}.`);
  }

  return lines.join("\n");
}
