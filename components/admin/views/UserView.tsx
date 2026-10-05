import Link from "next/link";
import type { AdminUserDetail } from "@/lib/admin/types";
import { AdminShell } from "@/components/AdminShell";
import { AreaChart } from "@/components/admin/AreaChart";
import { Stat } from "@/components/admin/Figures";
import { Timeline } from "@/components/admin/Timeline";
import { IconChat, IconCoins, IconMemory, IconTimeline } from "@/components/admin/icons";
import { fmtAgo, fmtDate, fmtInt, fmtPct, fmtUsd, initials } from "@/lib/admin/format";
import { sendPasswordReset, generateLoginLink } from "@/app/admin/actions";

const TABS = [
  { id: "timeline", label: "Timeline", icon: <IconTimeline /> },
  { id: "conversations", label: "Conversations", icon: <IconChat /> },
  { id: "memory", label: "Memory", icon: <IconMemory /> },
  { id: "usage", label: "Usage", icon: <IconCoins /> },
] as const;
type Tab = (typeof TABS)[number]["id"];

const MODE_LABEL = { vedic: "Vedic", western: "Western", numerology: "Numerology" } as const;
const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "adm-chip--lime" },
  happened: { label: "Happened", cls: "adm-chip--dark" },
  didnt: { label: "Didn't happen", cls: "adm-chip--outline" },
  unsure: { label: "Unsure", cls: "" },
};

export function UserView({ d, sp }: { d: AdminUserDetail; sp: { tab?: string; reset?: string; login_link?: string } }) {
  const id = d.user.id;
  const tab: Tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "timeline") as Tab;

  const { user, stats, memory } = d;
  const resolved = stats.predictionsHappened + stats.predictionsDidnt;
  const hitRate = resolved > 0 ? stats.predictionsHappened / resolved : null;
  const birth = user.birth;

  return (
    <AdminShell title={user.name || user.email || "User"} back={{ href: "/admin/users", label: "Back to users" }}>
      {sp.reset && <p className="adm-note mb-4">Password reset email sent.</p>}
      {sp.login_link && (
        <div className="adm-note mb-4">
          <div className="mb-1 font-medium">One-time login link (open in a private window to sign in as this user):</div>
          <div className="break-all text-xs">{decodeURIComponent(sp.login_link)}</div>
        </div>
      )}

      {/* profile card + stat strip, as the reference's patient card and vitals */}
      <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="adm-card flex gap-4">
          <span className="adm-avatar adm-avatar--lg" aria-hidden="true">
            {initials(user.name, user.email)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="adm-label">
              {birth?.place || "No birth place"}
              {birth?.timezone ? ` · ${birth.timezone}` : ""}
            </div>
            <div className="mt-1 text-lg leading-tight" style={{ overflowWrap: "anywhere" }}>
              {user.name || "(no profile yet)"}
            </div>
            <div className="adm-label mt-0.5 truncate">{user.email}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className={`adm-chip ${user.plan === "plus" ? "adm-chip--dark" : "adm-chip--white"}`}>{user.plan === "plus" ? "Plus" : "Free"}</span>
              {user.heavy && <span className="adm-chip adm-chip--lime">Heavy use</span>}
              {user.isAdmin && <span className="adm-chip adm-chip--outline">Admin</span>}
              {stats.pushDevices > 0 && <span className="adm-chip adm-chip--white">Push on</span>}
            </div>
            <div className="adm-label mt-3">
              {birth ? (
                <>
                  Born {fmtDate(`${birth.date}T00:00:00Z`)}
                  {birth.timeKnown ? `, ${birth.time.slice(0, 5)}` : ", time unknown"}
                </>
              ) : (
                "No birth details yet"
              )}
            </div>
            <div className="adm-label">
              Joined {fmtDate(user.createdAt)} · active {fmtAgo(user.lastActiveAt)}
            </div>
          </div>
        </div>

        <div className="adm-card adm-card--white">
          <div className="adm-strip" style={{ "--cols": 6 } as React.CSSProperties}>
            <Stat label="Readings" value={fmtInt(stats.readings)} sub={`${fmtInt(stats.deepReadings)} Deep`} />
            <Stat label="Cost, all time" value={fmtUsd(stats.costUsd)} sub={`${fmtUsd(stats.costUsd30d)} in 30 days`} />
            <Stat label="Facts" value={fmtInt(stats.facts)} sub={`${fmtInt(stats.summaries)} ${stats.summaries === 1 ? "summary" : "summaries"}`} />
            <Stat label="Hit rate" value={fmtPct(hitRate)} sub={`${fmtInt(resolved)} resolved, ${fmtInt(stats.predictionsOpen)} open`} />
            <Stat label="Lagna" value={user.chart?.lagna || "—"} sub={user.chart?.moonSign ? `Moon in ${user.chart.moonSign}` : undefined} />
            <Stat
              label="Dasha"
              value={user.chart?.mahadasha || "—"}
              sub={user.chart?.antardasha ? `${user.chart.antardasha} antardasha${user.chart.antardashaEnd ? ` to ${fmtDate(`${user.chart.antardashaEnd.slice(0, 10)}T00:00:00Z`)}` : ""}` : undefined}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <form action={sendPasswordReset}>
              <input type="hidden" name="email" value={user.email} />
              <input type="hidden" name="user_id" value={id} />
              <button className="adm-pill adm-pill--sm adm-pill--ghost" type="submit">
                Send password reset
              </button>
            </form>
            <form action={generateLoginLink}>
              <input type="hidden" name="email" value={user.email} />
              <input type="hidden" name="user_id" value={id} />
              <button className="adm-pill adm-pill--sm adm-pill--dark" type="submit">
                Generate login link
              </button>
            </form>
            <span className="adm-label self-center">Passwords are one-way hashes and cannot be shown.</span>
          </div>
        </div>
      </section>

      {/* pill tabs */}
      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="User sections">
        {TABS.map((t) => (
          <Link key={t.id} href={`/admin/users/${id}?tab=${t.id}`} className="adm-pill" aria-current={t.id === tab ? "page" : undefined} scroll={false}>
            {t.icon}
            {t.label}
            {t.id === "conversations" && <span className="adm-label">{d.conversations.length}</span>}
            {t.id === "memory" && <span className="adm-label">{memory.facts.length + memory.summaries.length + memory.predictions.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "timeline" && <Timeline events={d.timeline} />}

      {tab === "conversations" && (
        <section className="adm-card" aria-label="Conversations">
          {d.conversations.length === 0 ? (
            <p className="adm-muted text-sm">No conversations yet.</p>
          ) : (
            <ul className="flex flex-col">
              {d.conversations.map((c, i) => (
                <li key={c.id} style={{ borderTop: i ? "1px solid var(--adm-hair)" : undefined }}>
                  <Link href={`/admin/conversations/${c.id}`} className="flex items-center gap-3 rounded-2xl px-1 py-3 hover:bg-white/60">
                    <span className="adm-node adm-node--sm adm-node--grey" aria-hidden="true">
                      <IconChat size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.title}</span>
                      <span className="adm-label block">
                        {fmtInt(c.messages)} messages · started {fmtDate(c.createdAt)}
                      </span>
                    </span>
                    <span className="adm-chip adm-chip--white">{MODE_LABEL[c.mode]}</span>
                    <span className="adm-label hidden whitespace-nowrap sm:inline">{fmtAgo(c.lastMessageAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "memory" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="adm-card" aria-labelledby="facts-h">
            <h2 id="facts-h" className="adm-card-title mb-3">
              Facts <span className="adm-unit">{memory.facts.length}</span>
            </h2>
            {memory.facts.length === 0 ? (
              <p className="adm-muted text-sm">No facts learned.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {memory.facts.map((f) => (
                  <li key={f.id} className="adm-tile">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="adm-chip adm-chip--white">{f.category}</span>
                      <span className={`adm-chip ${f.confidence === "stated" ? "adm-chip--dark" : "adm-chip--outline"}`}>{f.confidence}</span>
                      <span className="adm-label ml-auto">{fmtDate(f.updatedAt)}</span>
                    </div>
                    <p className="mt-2 text-sm" style={{ overflowWrap: "anywhere" }}>
                      {f.fact}
                    </p>
                    <p className="adm-label mt-1">via {f.source.replace("_", " ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="adm-card" aria-labelledby="sum-h">
            <h2 id="sum-h" className="adm-card-title mb-3">
              Summaries <span className="adm-unit">{memory.summaries.length}</span>
            </h2>
            {memory.summaries.length === 0 ? (
              <p className="adm-muted text-sm">No conversation summaries.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {memory.summaries.map((s) => (
                  <li key={s.conversationId}>
                    <Link href={`/admin/conversations/${s.conversationId}`} className="adm-tile block hover:bg-white">
                      <span className="adm-label block">{fmtDate(s.lastMessageAt, { time: true })}</span>
                      <span className="mt-1 block text-sm" style={{ overflowWrap: "anywhere" }}>
                        {s.summary}
                      </span>
                      {s.topics.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {s.topics.map((t) => (
                            <span key={t} className="adm-chip adm-chip--white">
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="adm-card" aria-labelledby="pred-h">
            <h2 id="pred-h" className="adm-card-title mb-3">
              Predictions <span className="adm-unit">{memory.predictions.length}</span>
            </h2>
            {memory.predictions.length === 0 ? (
              <p className="adm-muted text-sm">No predictions recorded.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {memory.predictions.map((p) => {
                  const s = STATUS[p.status] ?? STATUS.unsure;
                  return (
                    <li key={p.id} className="adm-tile">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`adm-chip ${s.cls}`}>{s.label}</span>
                        <span className="adm-chip adm-chip--white">{p.topic}</span>
                        <span className="adm-label">{p.confidence}</span>
                      </div>
                      <p className="mt-2 text-sm" style={{ overflowWrap: "anywhere" }}>
                        {p.claim}
                      </p>
                      <p className="adm-label mt-1">
                        {fmtDate(`${p.windowStart}T00:00:00Z`)} to {fmtDate(`${p.windowEnd}T00:00:00Z`)}
                        {p.checkedAt ? ` · marked ${fmtDate(p.checkedAt)}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "usage" && (
        <div className="adm-grid-2">
          <section className="adm-card">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="adm-card-title">Readings, 30 days</h2>
              <span className="adm-num adm-num--sm">{fmtInt(d.usage.reduce((s, u) => s + u.readings, 0))}</span>
            </div>
            <AreaChart label="Readings" points={d.usage.map((u) => ({ day: u.day, value: u.readings }))} />
          </section>
          <section className="adm-card">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="adm-card-title">Model spend, 30 days</h2>
              <span className="adm-num adm-num--sm">{fmtUsd(stats.costUsd30d)}</span>
            </div>
            <AreaChart label="Spend (USD)" money points={d.usage.map((u) => ({ day: u.day, value: u.costUsd }))} />
          </section>
          <section className="adm-card lg:col-span-2" style={{ gridColumn: "1 / -1" }}>
            <div className="adm-strip" style={{ "--cols": 5 } as React.CSSProperties}>
              <Stat label="Daily readings sent" value={fmtInt(stats.dailyReadings)} />
              <Stat label="Alerts sent" value={fmtInt(stats.alerts)} />
              <Stat label="Life events" value={fmtInt(stats.lifeEvents)} />
              <Stat label="Push devices" value={fmtInt(stats.pushDevices)} />
              <Stat label="Cost per reading" value={fmtUsd(stats.readings ? stats.costUsd / stats.readings : 0)} unit="/ reading" />
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
