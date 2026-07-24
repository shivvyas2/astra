import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminGetUser } from "@/lib/admin/data";
import { AdminShell } from "@/components/AdminShell";
import { sendPasswordReset, generateLoginLink } from "@/app/admin/actions";

function fmt(s?: string | null, withTime = false) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted/60">{label}</div>
      <div className="mt-0.5 truncate text-sm">{value || "—"}</div>
    </div>
  );
}

export default async function AdminUser({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reset?: string; login_link?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const { user, birth, conversations } = await adminGetUser(id);

  const b = (birth ?? {}) as Record<string, string>;
  const fullName = [b.first_name, b.last_name].filter(Boolean).join(" ") || "(no profile yet)";

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <Link href="/admin" className="text-sm text-muted transition-colors hover:text-fg">← Users</Link>

        {/* header */}
        <div className="mt-4 flex items-center gap-4">
          {b.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent/15 text-lg font-semibold text-accent">
              {(b.first_name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{fullName}</h1>
            <p className="truncate text-sm text-muted">{user?.email}</p>
          </div>
        </div>

        {sp.reset && <p className="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">Password reset email sent.</p>}
        {sp.login_link && (
          <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
            <div className="mb-1 font-medium text-accent">One-time login link (open in a private window to sign in as this user):</div>
            <div className="break-all text-xs text-muted">{decodeURIComponent(sp.login_link)}</div>
          </div>
        )}

        {/* account */}
        <section className="mt-6 rounded-xl border border-white/10 p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">Account</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="First name" value={b.first_name} />
            <Field label="Last name" value={b.last_name} />
            <Field label="Email" value={user?.email} />
            <Field label="Joined" value={fmt(user?.createdAt)} />
            <Field label="Last sign in" value={fmt(user?.lastSignIn, true)} />
            <Field label="Email confirmed" value={user?.confirmed ? "Yes" : "No"} />
            <Field label="User ID" value={<span className="text-xs">{user?.id}</span>} />
          </div>
          <p className="mt-3 text-xs text-muted/60">
            Passwords are stored only as secure one-way hashes and cannot be displayed. Use the actions below.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={sendPasswordReset}>
              <input type="hidden" name="email" value={user?.email ?? ""} />
              <input type="hidden" name="user_id" value={id} />
              <button className="rounded-lg border border-white/15 px-3 py-2 text-sm transition-colors hover:bg-white/5">Send password reset</button>
            </form>
            <form action={generateLoginLink}>
              <input type="hidden" name="email" value={user?.email ?? ""} />
              <input type="hidden" name="user_id" value={id} />
              <button className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90">Generate login link</button>
            </form>
          </div>
        </section>

        {/* birth profile */}
        <section className="mt-5 rounded-xl border border-white/10 p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">Birth profile</h2>
          {birth ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Birth date" value={b.birth_date} />
              <Field label="Birth time" value={b.birth_time} />
              <Field label="Place" value={b.place_name} />
              <Field label="Timezone" value={b.timezone} />
              <Field label="Latitude" value={b.lat} />
              <Field label="Longitude" value={b.lng} />
            </div>
          ) : (
            <p className="text-sm text-muted">No birth details entered yet.</p>
          )}
        </section>

        {/* chats */}
        <section className="mt-5 rounded-xl border border-white/10 p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">Chats ({conversations.length})</h2>
          <div className="space-y-1">
            {conversations.length === 0 && <p className="text-sm text-muted">No chats yet.</p>}
            {conversations.map((c: { id: string; tradition: string; title: string | null; created_at: string }) => (
              <Link key={c.id} href={`/admin/conversations/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.03]">
                <span className="min-w-0 truncate text-sm">
                  <span className="mr-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-muted">{c.tradition}</span>
                  {c.title ?? "Reading"}
                </span>
                <span className="shrink-0 text-xs text-muted">{fmt(c.created_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
