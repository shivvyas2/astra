import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminListUsers } from "@/lib/admin/data";
import { AdminShell } from "@/components/AdminShell";

function initials(first: string, last: string, email: string) {
  const a = (first || email || "?").trim()[0] ?? "?";
  const b = (last || "").trim()[0] ?? "";
  return (a + b).toUpperCase();
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function AdminUsers() {
  await requireAdmin();
  const users = await adminListUsers();

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-6 w-1 rounded bg-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="text-sm text-muted">{users.length} total. Newest first.</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10">
          <div className="hidden grid-cols-[1fr,auto,auto,2rem] gap-4 border-b border-white/10 bg-white/[0.02] px-4 py-2.5 text-xs uppercase tracking-wide text-muted/70 sm:grid">
            <span>User</span><span>Joined</span><span>Chats</span><span></span>
          </div>
          {users.length === 0 && <p className="px-4 py-6 text-sm text-muted">No users yet.</p>}
          {users.map((u) => (
            <Link
              key={u.id}
              href={`/admin/users/${u.id}`}
              className="grid grid-cols-1 items-center gap-2 border-b border-white/5 px-4 py-3 transition-colors last:border-0 hover:bg-white/[0.03] sm:grid-cols-[1fr,auto,auto,2rem] sm:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {initials(u.firstName, u.lastName, u.email)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : "(no profile yet)"}
                  </div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                </div>
              </div>
              <div className="text-xs text-muted sm:text-sm">{fmtDate(u.createdAt)}</div>
              <div className="text-xs text-muted sm:text-sm">{u.conversationCount}</div>
              <span className="hidden justify-self-end text-accent sm:inline">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
