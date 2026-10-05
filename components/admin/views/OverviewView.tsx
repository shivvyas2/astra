import Link from "next/link";
import { HEAVY_USE } from "@/lib/admin/stats";
import type { Overview } from "@/lib/admin/types";
import { AdminShell } from "@/components/AdminShell";
import { AreaChart } from "@/components/admin/AreaChart";
import { Bars, Ring, Stat } from "@/components/admin/Figures";
import { IconCalendar } from "@/components/admin/icons";
import { fmtCompact, fmtInt, fmtPct, fmtUsd, initials } from "@/lib/admin/format";

export const RANGES = [7, 30, 90];
const MODE_LABEL = { vedic: "Vedic", western: "Western", numerology: "Numerology" } as const;
const KIND_LABEL: Record<string, string> = {
  reading: "Readings",
  deep_reading: "Deep readings",
  memory: "Memory pass",
  daily: "Daily readings",
  alert: "Alerts",
  extraction: "Timeline",
  other: "Other",
};

export function OverviewView({ o }: { o: Overview }) {
  const days = o.days;
  const t = o.totals;
  const sum = (k: "readings" | "signups" | "costUsd") => o.series.reduce((s, d) => s + d[k], 0);

  const secondary: [string, string, string?][] = [
    ["Users", fmtInt(t.users)],
    ["New", fmtInt(t.newUsers), `in ${days}d`],
    ["Active", fmtInt(t.activeUsers7d), "7 days"],
    ["Readings today", fmtInt(t.readingsToday)],
    ["Cost today", fmtUsd(t.costToday)],
    ["Deep share", fmtPct(t.deepShare)],
    ["Heavy use", fmtInt(t.heavyUsers), "users"],
    ["Facts", fmtCompact(t.facts)],
    ["Summaries", fmtCompact(t.conversationMemories)],
    ["Open predictions", fmtCompact(t.predictionsOpen)],
    ["Daily readings", fmtCompact(t.dailyReadings)],
    ["Alerts sent", fmtCompact(t.alertsSent)],
    ["Push devices", fmtInt(t.pushDevices)],
    ["Life events", fmtCompact(t.lifeEvents)],
  ];

  return (
    <AdminShell title="Overview">
      {/* filters: one row, above everything they scope */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="adm-round" aria-hidden="true" style={{ width: 40, height: 40 }}>
          <IconCalendar />
        </span>
        {RANGES.map((r) => (
          <Link key={r} href={`/admin?days=${r}`} className="adm-pill adm-pill--sm" aria-current={r === days ? "page" : undefined}>
            Last {r} days
          </Link>
        ))}
        <span className="adm-label ml-auto hidden sm:inline">
          Updated {new Date(o.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC
        </span>
      </div>

      {/* headline strip */}
      <section className="adm-card adm-card--white mb-4" aria-label="Headline numbers">
        <div className="adm-strip" style={{ "--cols": 5 } as React.CSSProperties}>
          <Stat label="Readings, all time" value={fmtCompact(t.readings)} unit="readings" hero />
          <Stat label={`Model spend, ${days} days`} value={fmtUsd(t.costUsd)} />
          <Stat label="Cost per reading" value={fmtUsd(t.costPerReading)} unit="/ reading" />
          <Stat label="Prediction hit rate" value={fmtPct(t.predictionHitRate)} unit={`${fmtInt(t.predictionsHappened)} of ${fmtInt(t.predictionsHappened + t.predictionsDidnt)}`} />
          <Stat label="Active users" value={fmtInt(t.activeUsers7d)} unit="last 7 days" />
        </div>
        <div className="adm-tiles mt-6">
          {secondary.map(([label, value, unit]) => (
            <div key={label} className="adm-tile">
              <div className="adm-label">{label}</div>
              <div className="adm-num adm-num--sm mt-1">
                {value}
                {unit && <span className="adm-unit">{unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* trends: one measure per chart, never two axes */}
      <section className="adm-grid-3 mb-4" aria-label="Trends">
        <div className="adm-card">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="adm-card-title">Readings</h2>
            <span className="adm-num adm-num--sm">
              {fmtInt(sum("readings"))}
              <span className="adm-unit">in {days}d</span>
            </span>
          </div>
          <AreaChart label="Readings" points={o.series.map((d) => ({ day: d.day, value: d.readings }))} />
        </div>
        <div className="adm-card">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="adm-card-title">Model spend</h2>
            <span className="adm-num adm-num--sm">{fmtUsd(sum("costUsd"))}</span>
          </div>
          <AreaChart label="Spend (USD)" money points={o.series.map((d) => ({ day: d.day, value: d.costUsd }))} />
        </div>
        <div className="adm-card">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="adm-card-title">Signups</h2>
            <span className="adm-num adm-num--sm">
              {fmtInt(sum("signups"))}
              <span className="adm-unit">in {days}d</span>
            </span>
          </div>
          <AreaChart label="Signups" points={o.series.map((d) => ({ day: d.day, value: d.signups }))} />
        </div>
      </section>

      {/* breakdowns */}
      <section className="adm-grid-3 mb-4" aria-label="Breakdowns">
        <div className="adm-card">
          <h2 className="adm-card-title mb-4">Readings by mode</h2>
          <Bars rows={o.modes.map((m) => ({ label: MODE_LABEL[m.mode], value: m.readings, display: fmtInt(m.readings) }))} />
          <h2 className="adm-card-title mb-4 mt-7">Spend by feature</h2>
          <Bars
            rows={o.kinds.map((k) => ({ label: KIND_LABEL[k.kind] ?? k.kind, value: k.costUsd, display: fmtUsd(k.costUsd), note: `${fmtInt(k.calls)} calls` }))}
            empty="No usage recorded yet. Apply migration 0010 to start tracking."
          />
        </div>
        <div className="adm-card">
          <h2 className="adm-card-title mb-4">Spend by model</h2>
          <Bars
            rows={o.models.map((m) => ({ label: m.model.replace(/^claude-/, ""), value: m.costUsd, display: fmtUsd(m.costUsd), note: `${fmtInt(m.calls)} calls` }))}
            empty="No usage recorded yet."
          />
        </div>
        <div className="adm-card">
          <h2 className="adm-card-title mb-4">Prediction hit rate</h2>
          <Ring
            rate={t.predictionHitRate}
            caption={
              t.predictionHitRate === null
                ? "No prediction has been marked happened or didn't yet."
                : `${fmtInt(t.predictionsHappened)} happened, ${fmtInt(t.predictionsDidnt)} didn't, as users marked them. ${fmtInt(t.predictionsOpen)} still open.`
            }
          />
        </div>
      </section>

      {/* top users */}
      <section className="adm-card" aria-labelledby="top-users">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="top-users" className="adm-card-title">
            Top users by cost, 30 days
          </h2>
          <span className="adm-label">
            Heavy use: {fmtUsd(HEAVY_USE.cost30dUsd)}+ in 30 days, or {HEAVY_USE.readingsPerDay}+ readings in a day. Nothing is limited.
          </span>
        </div>
        {o.topUsers.length === 0 ? (
          <p className="adm-muted text-sm">No spend recorded yet.</p>
        ) : (
          <ol className="flex flex-col">
            {o.topUsers.map((u, i) => {
              const heavy = u.heavy;
              return (
                <li key={u.id} style={{ borderTop: i ? "1px solid var(--adm-hair)" : undefined }}>
                  <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 rounded-2xl px-1 py-2.5 hover:bg-white/60">
                    <span className="adm-label w-5 text-right tabular-nums">{i + 1}</span>
                    <span className="adm-avatar" aria-hidden="true">
                      {initials(u.name, u.email)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{u.name || u.email || u.id}</span>
                      <span className="adm-label block truncate">{u.email}</span>
                    </span>
                    {heavy && <span className="adm-chip adm-chip--lime">Heavy use</span>}
                    <span className="text-right">
                      <span className="block text-sm tabular-nums">{fmtUsd(u.costUsd30d)}</span>
                      <span className="adm-label block">{fmtInt(u.readings30d)} readings</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </AdminShell>
  );
}
