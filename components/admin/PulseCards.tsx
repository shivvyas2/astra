import Link from "next/link";
import { AreaChart } from "@/components/admin/AreaChart";
import { Stat } from "@/components/admin/Figures";
import { STAGE_LABEL } from "@/components/admin/stages";
import { fmtAgo, fmtInt, fmtPct } from "@/lib/admin/format";
import type { Pulse } from "@/lib/admin/types";

const share = (n: number, of: number) => (of > 0 ? n / of : null);

/** People first: how many, how many today, where they stop, what went wrong, who to look at. */
export function PulseCards({ p }: { p: Pulse }) {
  const t = p.totals;
  const top = Math.max(1, p.funnel[0]?.reached ?? 1);
  return (
    <>
      <section className="adm-card adm-card--white mb-4" aria-label="People">
        <div className="adm-strip" style={{ "--cols": 5 } as React.CSSProperties}>
          <Stat label="Users, all time" value={fmtInt(t.users)} unit="users" hero />
          <Stat label="Active today" value={fmtInt(t.activeToday)} unit="people" />
          <Stat label="Active, 7 days" value={fmtInt(t.active7)} unit={fmtPct(share(t.active7, t.users))} />
          <Stat label="Active, 30 days" value={fmtInt(t.active30)} unit={fmtPct(share(t.active30, t.users))} />
          <Stat label="Joined, 7 days" value={fmtInt(t.joined7)} unit={`${fmtInt(t.joinedToday)} today`} />
        </div>
        <p className="adm-label mt-4">Admins are not counted. Days are UTC.</p>
      </section>

      <section className="adm-grid-2 mb-4" aria-label="Growth">
        <div className="adm-card">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="adm-card-title">Daily active people</h2>
            <span className="adm-num adm-num--sm">
              {fmtInt(t.activeToday)}
              <span className="adm-unit">today</span>
            </span>
          </div>
          <AreaChart label="Active people" points={p.series.map((d) => ({ day: d.day, value: d.active }))} />
          <p className="adm-label mt-3">
            {p.counting ? "Opens are counted from the day this was switched on; earlier days count only people who asked a question." : "Only people who asked a question, until migration 0021 is applied."}
          </p>
        </div>
        <div className="adm-card">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="adm-card-title">Total users</h2>
            <span className="adm-num adm-num--sm">
              {fmtInt(t.users)}
              <span className="adm-unit">+{fmtInt(p.series.reduce((n, d) => n + d.joined, 0))} in {p.days}d</span>
            </span>
          </div>
          <AreaChart label="Total users" points={p.series.map((d) => ({ day: d.day, value: d.total }))} />
        </div>
      </section>

      <section className="adm-grid-2 mb-4" aria-label="Drop-off and failures">
        <div className="adm-card">
          <h2 className="adm-card-title mb-1">Where people stop</h2>
          <p className="adm-label mb-4">Everyone who ever signed up. Open a step to see who stopped there.</p>
          <ol className="adm-bars">
            {p.funnel.map((f) => {
              const body = (
                <>
                  <span className="adm-label-text">{STAGE_LABEL[f.stage]}</span>
                  <span className="adm-bar-track" aria-hidden="true">
                    <span className="adm-bar-fill" style={{ width: `${(f.reached / top) * 100}%`, display: "block" }} />
                  </span>
                  <span className="tabular-nums">
                    {fmtInt(f.reached)}
                    <span className="adm-unit">{fmtPct(f.reached / top)}</span>
                  </span>
                </>
              );
              return (
                <li key={f.stage}>
                  <Link href={`/admin/users?stage=${f.stage}`} className="adm-bar-row">
                    {body}
                  </Link>
                  {f.lost > 0 && (
                    <span className={`adm-chip mt-1 ${f.stage === p.worst ? "adm-chip--lime" : "adm-chip--white"}`}>
                      {fmtInt(f.lost)} stopped before this{f.stage === p.worst ? ", the biggest drop" : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="adm-card">
          <h2 className="adm-card-title mb-4">Failures, {p.days} days</h2>
          <div className="adm-strip" style={{ "--cols": 3 } as React.CSSProperties}>
            <Stat label="Questions unanswered" value={fmtInt(p.failures.unanswered)} unit={`of ${fmtInt(p.failures.questions)}`} />
            <Stat label="People affected" value={fmtInt(p.failures.people)} />
            <Stat label="Never confirmed" value={fmtInt(p.failures.neverConfirmed)} unit="all time" />
          </div>
          {p.failures.recent.length === 0 ? (
            <p className="adm-muted mt-5 text-sm">Every question was answered.</p>
          ) : (
            <ul className="mt-5 flex flex-col">
              {p.failures.recent.map((r, i) => (
                <li key={`${r.conversationId}${r.at}`} style={{ borderTop: i ? "1px solid var(--adm-hair)" : undefined }}>
                  <Link href={`/admin/conversations/${r.conversationId}`} className="flex min-h-[44px] items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="adm-label whitespace-nowrap">{fmtAgo(r.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="adm-card mb-4" aria-labelledby="flags">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="flags" className="adm-card-title">Spam flags, 7 days</h2>
          <span className="adm-label">
            {fmtInt(p.flags.offTopic7)} off topic · {fmtInt(p.flags.instructions7)} tried to change its rules · {fmtInt(p.flags.abuse7)} abusive
          </span>
        </div>
        {p.flags.users.length === 0 ? (
          <p className="adm-muted text-sm">No one is misusing Astrya.</p>
        ) : (
          <ul className="flex flex-col">
            {p.flags.users.map((u, i) => (
              <li key={u.id} style={{ borderTop: i ? "1px solid var(--adm-hair)" : undefined }}>
                <Link href={`/admin/users/${u.id}`} className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{u.name || u.email || u.id}</span>
                  {u.reasons.map((r) => (
                    <span key={r} className="adm-chip adm-chip--outline">{r}</span>
                  ))}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="adm-label mt-3">Flags only show here; nobody is blocked by one. What people wrote is not kept with a flag, and anyone in crisis is never flagged.</p>
      </section>
    </>
  );
}
