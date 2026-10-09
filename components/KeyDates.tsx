import Link from "next/link";
import { DateTime } from "luxon";
import type { TimingEvent, Tone } from "@/lib/timing/engine";
import type { Timing } from "@/lib/timing/load";
import { TOPIC_LABEL } from "@/lib/memory/types";
import { ScreenHeader } from "@/components/ScreenHeader";
const TONE: Record<Tone, { label: string; cls: string }> = {
  supportive: { label: "Supportive", cls: "bg-accent" },
  challenging: { label: "Challenging", cls: "bg-ember" },
  mixed: { label: "Mixed", cls: "bg-fg/80" },
};

const KIND: Record<TimingEvent["kind"], string> = { ingress: "Transit", station: "Station", dasha: "Period" };

/** Key dates: the timing engine's year ahead, grouped by month. */
export function KeyDates({ timing }: { timing: Pick<Timing, "events"> }) {
  const months = new Map<string, TimingEvent[]>();
  for (const e of timing.events) {
    const key = e.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), e]);
  }
  const next = timing.events[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
        <ScreenHeader
          eyebrow="Key dates"
          title="The year ahead, to the day"
          arrow
          blurb="Every sign change, station and sub-period in the next twelve months, computed from the ephemeris and read against your chart. Readings quote these dates."
        >
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/api/timing/ics" className="brut-btn brut-btn-accent brut-btn-arrow min-h-[48px]">
              Add to calendar
            </a>
            <Link href="/app/chat" className="brut-btn brut-btn-secondary min-h-[48px]">Ask about a date</Link>
          </div>
        </ScreenHeader>

        {next && (
          <section className="brut-card mt-10 p-5 sm:p-6">
            <p className="eyebrow">Next</p>
            <p className="mt-3 flex items-baseline gap-3">
              <span className="text-7xl font-light tabular-nums tracking-tight text-accent">
                {DateTime.fromISO(next.date).toFormat("dd")}
              </span>
              <span className="text-xl text-fg">{DateTime.fromISO(next.date).toFormat("LLLL yyyy")}</span>
            </p>
            <h2 className="headline mt-3 text-2xl">{next.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{next.detail}</p>
          </section>
        )}

        {timing.events.length === 0 && (
          <p className="brut-card mt-10 p-5 text-sm text-muted">Nothing changes in your sky in the next twelve months.</p>
        )}

        {[...months.entries()].map(([month, events]) => (
          <section key={month} className="mt-10">
            <p className="eyebrow">{DateTime.fromISO(`${month}-01`).toFormat("LLLL yyyy")}</p>
            <ul className="mt-2 border-t border-rule">
              {events.map((e) => (
                <li key={e.id} className="grid grid-cols-[3.25rem_1fr] gap-4 border-b border-rule py-4">
                  <span className="text-3xl font-light tabular-nums tracking-tight">{DateTime.fromISO(e.date).toFormat("dd")}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`brut-tag ${TONE[e.tone].cls}`}>{TONE[e.tone].label}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">{KIND[e.kind]}</span>
                    </div>
                    <p className="mt-2 text-[15px] font-semibold leading-snug">{e.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{e.detail}</p>
                    {e.topics.length > 0 && (
                      <p className="mt-2 text-xs text-muted">{e.topics.map((t) => TOPIC_LABEL[t]).join(" · ")}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-10 text-xs text-muted">
          Supportive and challenging follow classical gochara, counted from your Moon. Computed, not predicted: a reading
          says what a date is likely to mean for you.
        </p>
      </div>
    </div>
  );
}
