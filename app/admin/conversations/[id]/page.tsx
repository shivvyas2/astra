import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { adminGetTranscript } from "@/lib/admin/data";

export default async function AdminTranscript({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { conv, messages } = await adminGetTranscript(id);
  return (
    <div className="mx-auto max-w-2xl">
      {conv && <Link href={`/admin/users/${conv.user_id}`} className="text-sm text-muted">← Conversations</Link>}
      <h1 className="my-4 break-words text-xl font-bold sm:text-2xl">{conv?.title ?? "Transcript"}</h1>
      <div className="space-y-4">
        {messages.map((m, i) => (
          <div key={i}>
            <div className="text-xs uppercase text-muted">{m.role}</div>
            <div className="whitespace-pre-wrap break-words rounded-md bg-white/5 p-3">{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
