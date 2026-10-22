import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createServerSupabase } from "@/lib/supabase/server";
import { ScreenHeader } from "@/components/ScreenHeader";
import { WebPushControls } from "@/components/WebPushControls";

export const dynamic = "force-dynamic";

type Reading = { id: string; for_date: string; slot: "morning" | "night"; title: string; body: string; detail: string };
type Alert = { id: string; severity: "info" | "caution" | "warning"; kinds: string[]; title: string; body: string; detail: string; created_at: string };

const SEVERITY: Record<Alert["severity"], string> = { info: "Note", caution: "Caution", warning: "Warning" };

function day(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * Today on the web: the morning and evening readings and the alerts the
 * hourly job writes, newest first, the same rows the iPhone's Today tab
 * shows. Also where this browser turns notifications on.
 */
export default async function TodayPage() {
  const db = await createServerSupabase();
  const [{ data: readings }, { data: alerts }] = await Promise.all([
    db.from("daily_readings").select("id, for_date, slot, title, body, detail").order("for_date", { ascending: false }).order("slot", { ascending: true }).limit(14),
    db.from("alerts").select("id, severity, kinds, title, body, detail, created_at").order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <ScreenHeader eyebrow="Today" title="Your readings" blurb="A reading each morning and evening, and an alert when something in your sky changes." />

        <div className="mt-8">
          <WebPushControls publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
        </div>

        <section className="mt-10">
          <h2 className="eyebrow">Readings</h2>
          {(readings as Reading[] | null)?.length ? (
            (readings as Reading[]).map((r) => (
              <details key={r.id} className="group border-b border-rule py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block text-sm text-muted">{day(r.for_date)}, {r.slot === "morning" ? "morning" : "evening"}</span>
                    <span className="mt-1 block text-[17px] font-semibold">{r.title}</span>
                    <span className="mt-1 block text-[15px] text-muted">{r.body}</span>
                  </span>
                  <span aria-hidden className="mt-1 text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="prose-reading mt-3 max-w-none text-[15px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.detail}</ReactMarkdown>
                </div>
              </details>
            ))
          ) : (
            <p className="mt-3 text-[15px] text-muted">Your first reading arrives the next morning or evening.</p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="eyebrow">Alerts</h2>
          {(alerts as Alert[] | null)?.length ? (
            (alerts as Alert[]).map((a) => (
              <details key={a.id} className="group border-b border-rule py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className={`block text-sm ${a.severity === "warning" ? "text-ember" : "text-muted"}`}>
                      {SEVERITY[a.severity]}, {new Date(a.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                    </span>
                    <span className="mt-1 block text-[17px] font-semibold">{a.title}</span>
                    <span className="mt-1 block text-[15px] text-muted">{a.body}</span>
                  </span>
                  <span aria-hidden className="mt-1 text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="prose-reading mt-3 max-w-none text-[15px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.detail}</ReactMarkdown>
                </div>
              </details>
            ))
          ) : (
            <p className="mt-3 text-[15px] text-muted">Nothing has changed in your sky yet. Alerts appear here when a dosha or a hard transit begins or ends.</p>
          )}
        </section>
      </div>
    </div>
  );
}
