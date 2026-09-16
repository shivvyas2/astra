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
