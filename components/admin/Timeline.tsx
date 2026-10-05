import Link from "next/link";
import type { TimelineEvent, TimelineKind } from "@/lib/admin/types";
import {
  IconBell,
  IconBolt,
  IconCalendar,
  IconChat,
  IconCheck,
  IconNote,
  IconPin,
  IconSun,
  IconTarget,
  IconUserPlus,
} from "./icons";

const KIND: Record<TimelineKind, { label: string; icon: React.ReactNode }> = {
  signup: { label: "Signed up", icon: <IconUserPlus size={14} /> },
  reading: { label: "Reading", icon: <IconChat size={14} /> },
  deep_reading: { label: "Deep reading", icon: <IconBolt size={14} /> },
  daily: { label: "Daily", icon: <IconSun size={14} /> },
  alert: { label: "Alert", icon: <IconBell size={14} /> },
  life_event: { label: "Life event", icon: <IconPin size={14} /> },
  prediction: { label: "Prediction", icon: <IconTarget size={14} /> },
  prediction_resolved: { label: "Resolved", icon: <IconCheck size={14} /> },
  fact: { label: "Fact", icon: <IconNote size={14} /> },
};

const PER_MONTH = 8;

const monthKey = (iso: string) => iso.slice(0, 7);
const monthName = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString("en-US", { ...opts, timeZone: "UTC" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/**
 * The user's history as a horizontal timeline, modelled on the reference:
 * a rail of lime month nodes, event cards hanging off thin connectors, and a
 * month scrubber pill bar along the bottom. Newest month on the right and in
 * view first; the scrubber jumps to any month.
 */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="adm-muted text-sm">Nothing has happened yet.</p>;

  const months = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    if (!e.at) continue;
    const k = monthKey(e.at);
    months.set(k, [...(months.get(k) ?? []), e]);
  }
  const newestFirst = [...months.keys()].sort().reverse();
  const chronological = [...newestFirst].reverse();

  return (
    <div>
      <div className="adm-tl" role="list" aria-label="Timeline, newest month first">
        {newestFirst.map((k) => {
          const list = months.get(k)!;
          const shown = list.slice(0, PER_MONTH);
          return (
            <section key={k} id={`tl-${k}`} className="adm-tl-month" role="listitem" aria-label={monthName(k, { month: "long", year: "numeric" })}>
              <div className="adm-tl-head">
                <span className="adm-node">
                  <IconCalendar />
                </span>
              </div>
              <div className="mt-2" style={{ marginLeft: 34 }}>
                <div className="adm-tl-month-name">{monthName(k, { month: "short" })}</div>
                <div className="adm-label">
                  {monthName(k, { year: "numeric" })} · {list.length} event{list.length === 1 ? "" : "s"}
                </div>
              </div>
              <ol className="adm-tl-events">
                {shown.map((e, i) => {
                  const kind = KIND[e.kind] ?? KIND.reading;
                  const body = (
                    <>
                      <span className="adm-ev-top">
                        <span className="inline-flex items-center gap-2">
                          <span className={`adm-node adm-node--sm${e.kind === "reading" || e.kind === "deep_reading" ? "" : " adm-node--grey"}`}>
                            {kind.icon}
                          </span>
                          <span className="adm-chip adm-chip--white">{kind.label}</span>
                        </span>
                        <span className="adm-label whitespace-nowrap">{when(e.at)}</span>
                      </span>
                      <span className="adm-ev-title block">{e.title}</span>
                      {e.detail && <span className="adm-ev-detail">{e.detail}</span>}
                    </>
                  );
                  const linkable = (e.kind === "reading" || e.kind === "deep_reading") && e.refId;
                  return (
                    <li key={`${e.kind}-${e.refId ?? ""}-${e.at}-${i}`} className="adm-tl-event">
                      {linkable ? (
                        <Link href={`/admin/conversations/${e.refId}`} className="adm-ev">
                          {body}
                        </Link>
                      ) : (
                        <div className="adm-ev">{body}</div>
                      )}
                    </li>
                  );
                })}
                {list.length > shown.length && (
                  <li className="adm-tl-event">
                    <span className="adm-ev-pill">
                      <span className="adm-round" aria-hidden="true">
                        +
                      </span>
                      {list.length - shown.length} more this month
                    </span>
                  </li>
                )}
              </ol>
            </section>
          );
        })}
      </div>

      <nav className="adm-scrub" aria-label="Jump to month">
        <span className="adm-round adm-round--dark adm-scrub-cal" aria-hidden="true" style={{ width: 36, height: 36 }}>
          <IconCalendar size={15} />
        </span>
        {chronological.map((k, i) => (
          <a key={k} href={`#tl-${k}`} className={`adm-scrub-item${i === chronological.length - 1 ? " adm-scrub-item--recent" : ""}`}>
            {monthName(k, { month: "short", ...(i === 0 || k.endsWith("-01") ? { year: "2-digit" } : {}) })}
            <span className="adm-scrub-badge" aria-label={`${months.get(k)!.length} events`}>
              {months.get(k)!.length}
            </span>
          </a>
        ))}
      </nav>
    </div>
  );
}
