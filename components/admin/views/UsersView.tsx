import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { IconSearch } from "@/components/admin/icons";
import { fmtAgo, fmtInt, fmtUsd, initials } from "@/lib/admin/format";
import type { AdminUserRow } from "@/lib/admin/types";

export const PAGE = 50;

function Badges({ u }: { u: AdminUserRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className={`adm-chip ${u.plan === "plus" ? "adm-chip--dark" : "adm-chip--white"}`}>{u.plan === "plus" ? "Plus" : "Free"}</span>
      {u.heavy && <span className="adm-chip adm-chip--lime">Heavy use</span>}
      {u.isAdmin && <span className="adm-chip adm-chip--outline">Admin</span>}
    </span>
  );
}

function Push({ on }: { on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={on ? "Push notifications on" : "No push device"}>
      <span className={`adm-dot${on ? "" : " adm-dot--off"}`} aria-hidden="true" />
      <span className="adm-label">{on ? "Push" : "No push"}</span>
    </span>
  );
}

export function UsersView({ users, total, q, page }: { users: AdminUserRow[]; total: number; q: string; page: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <AdminShell title="Users">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form className="relative w-full sm:w-96" role="search" action="/admin/users">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 adm-muted">
            <IconSearch />
          </span>
          <label htmlFor="q" className="sr-only">
            Search by email or name
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Search email or name" className="adm-input" />
        </form>
        <span className="adm-label">
          {fmtInt(total)} {q ? "matching" : "total"} · newest active first
        </span>
      </div>

      {users.length === 0 ? (
        <div className="adm-card">
          <p className="adm-muted text-sm">{q ? `No one matches “${q}”.` : "No users yet."}</p>
        </div>
      ) : (
        <>
          {/* desktop: a table */}
          <div className="adm-card hidden md:block" style={{ padding: "16px 8px" }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th className="num">Readings</th>
                  <th className="num">7 days</th>
                  <th className="num">Cost, 30d</th>
                  <th className="num">Facts</th>
                  <th className="num">Open predictions</th>
                  <th>Last active</th>
                  <th>Push</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/users/${u.id}`} className="flex min-w-0 items-center gap-3">
                        <span className="adm-avatar" aria-hidden="true">
                          {initials(u.name, u.email)}
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[260px] truncate">{u.name || "(no profile yet)"}</span>
                          <span className="adm-label block max-w-[260px] truncate">{u.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Badges u={u} />
                    </td>
                    <td className="num">{fmtInt(u.readings)}</td>
                    <td className="num">{fmtInt(u.readings7d)}</td>
                    <td className="num">{fmtUsd(u.costUsd30d)}</td>
                    <td className="num">{fmtInt(u.facts)}</td>
                    <td className="num">{fmtInt(u.predictionsOpen)}</td>
                    <td className="whitespace-nowrap">{fmtAgo(u.lastActiveAt)}</td>
                    <td>
                      <Push on={u.hasPush} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* phones: cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {users.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`} className="adm-card block" style={{ padding: 16 }}>
                  <span className="flex items-center gap-3">
                    <span className="adm-avatar" aria-hidden="true">
                      {initials(u.name, u.email)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{u.name || "(no profile yet)"}</span>
                      <span className="adm-label block truncate">{u.email}</span>
                    </span>
                    <Push on={u.hasPush} />
                  </span>
                  <span className="mt-3 block">
                    <Badges u={u} />
                  </span>
                  <span className="mt-3 grid grid-cols-3 gap-2">
                    <span>
                      <span className="adm-label block">Readings</span>
                      <span className="adm-num adm-num--sm">{fmtInt(u.readings)}</span>
                    </span>
                    <span>
                      <span className="adm-label block">Cost, 30d</span>
                      <span className="adm-num adm-num--sm">{fmtUsd(u.costUsd30d)}</span>
                    </span>
                    <span>
                      <span className="adm-label block">Active</span>
                      <span className="adm-num adm-num--sm">{fmtAgo(u.lastActiveAt)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav className="mt-5 flex items-center justify-center gap-2" aria-label="Pages">
          {page > 1 && (
            <Link href={href(page - 1)} className="adm-pill adm-pill--sm">
              Previous
            </Link>
          )}
          <span className="adm-label">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={href(page + 1)} className="adm-pill adm-pill--sm">
              Next
            </Link>
          )}
        </nav>
      )}
    </AdminShell>
  );
}
