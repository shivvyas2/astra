import { GRANT_DURATIONS, type PlusState } from "@/lib/admin/plus";
import { fmtDate } from "@/lib/admin/format";
import { grantUserPlus, revokeUserPlus } from "@/app/admin/actions";

/** Grant, extend or remove Plus for one user, without an App Store purchase. */

const NOTICES: Record<string, string> = {
  granted: "Plus granted.",
  revoked: "Plus removed.",
  apple: "This user pays through the App Store. Only they can change that subscription.",
  unavailable: "Apply migration 0011 to grant Plus.",
  none: "Nothing to remove.",
  invalid: "Pick a duration.",
};

function summary(s: PlusState): string {
  if (s.plan === "free") {
    if (s.source === "none") return "Free";
    return `Free · ${s.source === "apple" ? "App Store" : "granted"} Plus ended ${s.expiresAt ? fmtDate(s.expiresAt) : ""}`.trim();
  }
  if (s.forever) return "Plus forever (granted)";
  const until = s.expiresAt ? ` until ${fmtDate(s.expiresAt)}` : "";
  return s.source === "apple" ? `Plus via App Store${until}` : `Plus granted${until}`;
}

export function PlusCard({ userId, state, status }: { userId: string; state: PlusState; status?: string }) {
  const apple = state.source === "apple" && state.plan === "plus";
  const extending = state.source === "admin" && state.plan === "plus";
  return (
    <section id="plus" className="adm-card adm-card--white mb-5" aria-labelledby="plus-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plus-title" className="adm-card-title">
          Plus
        </h2>
        <span className="adm-label">{summary(state)}</span>
      </div>
      {status && NOTICES[status] && <p className="adm-note mb-4">{NOTICES[status]}</p>}
      {!state.available ? (
        <p className="adm-muted text-sm">{NOTICES.unavailable}</p>
      ) : apple ? (
        <p className="adm-muted text-sm">{NOTICES.apple}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <form action={grantUserPlus} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="user_id" value={userId} />
            <select name="duration" defaultValue="1m" className="adm-pill adm-pill--sm" aria-label="Duration">
              {GRANT_DURATIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <button className="adm-pill adm-pill--sm adm-pill--dark" type="submit">
              {extending ? "Extend Plus" : "Grant Plus"}
            </button>
          </form>
          {state.source === "admin" && (
            <form action={revokeUserPlus}>
              <input type="hidden" name="user_id" value={userId} />
              <button className="adm-pill adm-pill--sm adm-pill--ghost" type="submit">
                Remove Plus
              </button>
            </form>
          )}
          <span className="adm-label">
            {extending ? "Extends from the current end date." : "No purchase needed. Removes the shared daily spend cap for them."}
          </span>
        </div>
      )}
    </section>
  );
}
