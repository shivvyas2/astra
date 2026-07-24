import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminListConversations } from "@/lib/admin/data";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const convs = await adminListConversations(id);
  return (
    <div>
      <Link href="/admin" className="text-sm text-muted">← Users</Link>
      <h1 className="my-4 text-2xl font-bold">Conversations</h1>
      <ul className="space-y-2">
        {convs.map((c) => (
          <li key={c.id} className="border-t border-white/10 py-2">
            <Link className="text-accent" href={`/admin/conversations/${c.id}`}>
              [{c.tradition}] {c.title ?? "(untitled)"}
            </Link>
            <span className="ml-2 text-xs text-muted">{new Date(c.created_at).toLocaleString()}</span>
          </li>
        ))}
        {convs.length === 0 && <p className="text-muted">No conversations.</p>}
      </ul>
    </div>
  );
}
