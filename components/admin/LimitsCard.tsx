import type { LimitsState, UserLimitsState } from "@/lib/admin/limits";
import type { Limits } from "@/lib/usage/limits";
import { fmtInt, fmtUsd } from "@/lib/admin/format";
import { updateLimits, updateUserLimits } from "@/app/admin/actions";

/**
 * The daily limits (lib/usage/limits.ts) as forms: everyone's on the
 * overview, one user's overrides on their page. Blank is "no limit" (or, for
 * an override, "use the default"). Admins are never limited.
 */

const inputStyle = { paddingLeft: 18, height: 40 };

function Field({ name, label, hint, value, placeholder, usd }: {
  name: string;
  label: string;
  hint: string;
  value: number | null;
  placeholder: string;
  usd?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="adm-label">{label}</span>
      <input
        name={name}
        type="number"
        inputMode={usd ? "decimal" : "numeric"}
        min={0}
        step={usd ? 0.01 : 1}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className="adm-input mt-1"
        style={inputStyle}
      />
      <span className="adm-label mt-1 block">{hint}</span>
    </label>
  );
}

function Notice({ status }: { status?: string }) {
  if (status === "saved") return <p className="adm-note mb-4">Limits saved. They apply from the next reading.</p>;
  if (status === "invalid") return <p className="adm-note mb-4">Nothing saved: limits must be 0 or more, readings a whole number.</p>;
  return null;
}

const Unavailable = () => (
  <p className="adm-muted text-sm">Apply migration 0018 to set limits. Until then nothing is limited.</p>
);

const show = (v: number | null, usd?: boolean) => (v === null ? "no limit" : usd ? fmtUsd(v) : fmtInt(v));

export function LimitsCard({ state, status }: { state: LimitsState; status?: string }) {
  const l = state.limits;
  const allUsed = l.usdAllUsersDay ? Math.min(1, state.costTodayUsd / l.usdAllUsersDay) : null;
  return (
    <section id="limits" className="adm-card adm-card--white mb-4" aria-labelledby="limits-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="limits-title" className="adm-card-title">
          Daily limits
        </h2>
        <span className="adm-label">
          Spend today {fmtUsd(state.costTodayUsd)}
          {l.usdAllUsersDay !== null && ` of ${fmtUsd(l.usdAllUsersDay)}`}
          {allUsed !== null && ` (${Math.round(allUsed * 100)}%)`} · admins are never limited
        </span>
      </div>
      <Notice status={status} />
      {!state.available ? (
        <Unavailable />
      ) : (
        <form action={updateLimits}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="readings_per_day"
              label="Readings per user, per day"
              hint="Normal and Deep. Resets at the user's midnight."
              value={l.readingsPerDay}
              placeholder="No limit"
            />
            <Field
              name="usd_per_user_day"
              label="Spend per user, per day (USD)"
              hint="Also covers timeline scans. A reading is about $0.02, Deep $0.05."
              value={l.usdPerUserDay}
              placeholder="No limit"
              usd
            />
            <Field
              name="usd_all_users_day"
              label="Spend for everyone, per day (USD)"
              hint="When reached, readings pause for all users until midnight UTC."
              value={l.usdAllUsersDay}
              placeholder="No limit"
              usd
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="adm-pill adm-pill--sm adm-pill--dark" type="submit">
              Save limits
            </button>
            <span className="adm-label">Leave a field blank for no limit. 0 stops it entirely.</span>
          </div>
        </form>
      )}
    </section>
  );
}

export function UserLimitsCard({ userId, state, isAdmin, status }: {
  userId: string;
  state: UserLimitsState;
  isAdmin: boolean;
  status?: string;
}) {
  const d: Limits = state.defaults;
  const o = state.overrides;
  return (
    <section className="adm-card adm-card--white mb-5" aria-labelledby="user-limits-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="user-limits-title" className="adm-card-title">
          Daily limits for this user
        </h2>
        <span className="adm-label">
          {isAdmin ? "Admin: never limited" : o ? "Custom limits" : "Using the defaults"}
        </span>
      </div>
      <Notice status={status} />
      {!state.available ? (
        <Unavailable />
      ) : (
        <form action={updateUserLimits}>
          <input type="hidden" name="user_id" value={userId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="readings_per_day"
              label="Readings per day"
              hint={`Default: ${show(d.readingsPerDay)}. 0 blocks readings.`}
              value={o?.readingsPerDay ?? null}
              placeholder={`Default (${show(d.readingsPerDay)})`}
            />
            <Field
              name="usd_per_user_day"
              label="Spend per day (USD)"
              hint={`Default: ${show(d.usdPerUserDay, true)}.`}
              value={o?.usdPerUserDay ?? null}
              placeholder={`Default (${show(d.usdPerUserDay, true)})`}
              usd
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="adm-pill adm-pill--sm adm-pill--dark" type="submit">
              Save for this user
            </button>
            <span className="adm-label">Blank uses the default. The all-users limit still applies.</span>
          </div>
        </form>
      )}
    </section>
  );
}
