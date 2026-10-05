import type { AdminConversation } from "@/lib/admin/types";
import { AdminShell } from "@/components/AdminShell";
import { fmtDate } from "@/lib/admin/format";

const MODE_LABEL = { vedic: "Vedic", western: "Western", numerology: "Numerology" } as const;

export function TranscriptView({ data }: { data: AdminConversation }) {
  const { conversation: c, messages } = data;

  return (
    <AdminShell title="Transcript" back={{ href: `/admin/users/${c.userId}?tab=conversations`, label: "Back to user" }}>
      <div className="mx-auto max-w-3xl">
        <div className="adm-card adm-card--white mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="adm-chip adm-chip--lime">{MODE_LABEL[c.mode]}</span>
            <span className="adm-label">
              Started {fmtDate(c.createdAt, { time: true })} UTC · {messages.length} messages
            </span>
          </div>
          <h2 className="mt-2 text-xl leading-snug" style={{ overflowWrap: "anywhere" }}>
            {c.title}
          </h2>
        </div>

        <ol className="flex flex-col gap-3">
          {messages.length === 0 && <li className="adm-muted text-sm">No messages.</li>}
          {messages.map((m, i) => (
            <li key={i} className={`adm-bubble adm-bubble--${m.role}`}>
              <div className="adm-label mb-1">
                {m.role === "user" ? "User" : "Astrya"} · {fmtDate(m.createdAt, { time: true, year: false })}
              </div>
              {m.content}
            </li>
          ))}
        </ol>
      </div>
    </AdminShell>
  );
}
