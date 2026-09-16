import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminGetTranscript } from "@/lib/admin/data";
import { AdminShell } from "@/components/AdminShell";

export default async function AdminTranscript({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { conv, messages } = await adminGetTranscript(id);

  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8">
        {conv && (
          <Link href={`/admin/users/${conv.user_id}`} className="text-sm text-muted transition-colors hover:text-fg">
            ← Back to user
          </Link>
        )}
        <div className="mt-3 flex items-center gap-2">
          {conv && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-muted">{conv.tradition}</span>}
          <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{conv?.title ?? "Transcript"}</h1>
        </div>

        <div className="mt-6 space-y-4">
          {messages.length === 0 && <p className="text-sm text-muted">No messages.</p>}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-accent/15 text-fg" : "bg-white/[0.05] text-fg/90"}`}>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted/60">{m.role === "user" ? "User" : "Sanchara"}</div>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
