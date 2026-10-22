import Link from "next/link";
import { DateTime } from "luxon";
import type { TimingEvent, Tone } from "@/lib/timing/engine";
import type { Timing } from "@/lib/timing/load";
import { ScreenHeader } from "@/components/ScreenHeader";
import { CompareDates } from "@/components/CompareDates";
import { getI18n } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/config";
import { timingText } from "@/lib/i18n/astro";

const TONE_CLASS: Record<Tone, string> = { supportive: "bg-accent", challenging: "bg-ember", mixed: "bg-fg/80" };

/** Key dates: the timing engine's year ahead, grouped by month. */
export async function KeyDates({ timing }: { timing: Pick<Timing, "events" | "today"> }) {
  const i18n = await getI18n();
  const { t } = i18n;
  // Month names in the reader's language, Western digits.
  const when = (iso: string) => DateTime.fromISO(iso).setLocale(intlLocale(i18n.locale));
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
          eyebrow={t.keyDates.eyebrow}
          title={t.keyDates.title}
          arrow
          blurb={t.keyDates.blurb}
        >
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/api/timing/ics" className="brut-btn brut-btn-accent brut-btn-arrow min-h-[48px]">
              {t.keyDates.addToCalendar}
            </a>
            <Link href="/app/chat" className="brut-btn brut-btn-secondary min-h-[48px]">{t.keyDates.askAboutDate}</Link>
          </div>
        </ScreenHeader>

        {next && (
          <section className="brut-card mt-10 p-5 sm:p-6">
            <p className="eyebrow">{t.keyDates.next}</p>
            <p className="mt-3 flex items-baseline gap-3">
              <span className="text-7xl font-light tabular-nums tracking-tight text-accent">
                {when(next.date).toFormat("dd")}
              </span>
              <span className="text-xl text-fg">{when(next.date).toFormat("LLLL yyyy")}</span>
            </p>
            <h2 className="headline mt-3 text-2xl">{timingText(i18n, next).title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{timingText(i18n, next).detail}</p>
          </section>
        )}

        <CompareDates today={timing.today} />

        {timing.events.length === 0 && (
          <p className="brut-card mt-10 p-5 text-sm text-muted">{t.keyDates.nothing}</p>
        )}

        {[...months.entries()].map(([month, events]) => (
          <section key={month} className="mt-10">
            <p className="eyebrow">{when(`${month}-01`).toFormat("LLLL yyyy")}</p>
            <ul className="mt-2 border-t border-rule">
              {events.map((e) => {
                const text = timingText(i18n, e);
                return (
                  <li key={e.id} className="grid grid-cols-[3.25rem_1fr] gap-4 border-b border-rule py-4">
                    <span className="text-3xl font-light tabular-nums tracking-tight">{when(e.date).toFormat("dd")}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`brut-tag ${TONE_CLASS[e.tone]}`}>{t.keyDates.tone[e.tone]}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">{t.keyDates.kind[e.kind]}</span>
                      </div>
                      <p className="mt-2 text-[15px] font-semibold leading-snug">{text.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{text.detail}</p>
                      {e.topics.length > 0 && (
                        <p className="mt-2 text-xs text-muted">{e.topics.map((topic) => t.topics[topic]).join(" · ")}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <p className="mt-10 text-xs text-muted">{t.keyDates.footnote}</p>
      </div>
    </div>
  );
}
