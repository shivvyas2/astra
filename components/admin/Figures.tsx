import { fmtPct } from "@/lib/admin/format";

/** A small grey label over a big light number with a small unit: "1,204 readings". */
export function Stat({
  label,
  value,
  unit,
  sub,
  hero,
}: {
  label: string;
  value: React.ReactNode;
  /** Short unit beside the number. */
  unit?: string;
  /** A longer note on its own line under the number. */
  sub?: string;
  hero?: boolean;
}) {
  return (
    <div className="adm-stat">
      <div className="adm-label">{label}</div>
      <div className={`adm-num${hero ? " adm-num--hero" : ""}`} style={{ overflowWrap: "anywhere" }}>
        {value}
        {unit && <span className="adm-unit">{unit}</span>}
      </div>
      {sub && <div className="adm-label mt-1">{sub}</div>}
    </div>
  );
}

/** Magnitude bars for a handful of categories: graphite on a hairline track, value at the tip. */
export function Bars({ rows, empty = "Nothing yet." }: { rows: { label: string; value: number; display: string; note?: string }[]; empty?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0 || max === 0) return <p className="adm-muted text-sm">{empty}</p>;
  return (
    <div className="adm-bars">
      {rows.map((r) => (
        <div key={r.label} className="adm-bar-row" title={`${r.label}: ${r.display}${r.note ? ` (${r.note})` : ""}`}>
          <span className="adm-label-text">{r.label}</span>
          <span className="adm-bar-track" aria-hidden="true">
            <span className="adm-bar-fill" style={{ width: `${(r.value / max) * 100}%`, display: "block" }} />
          </span>
          <span className="tabular-nums">
            {r.display}
            {r.note && <span className="adm-unit">{r.note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The prediction hit-rate meter: a graphite arc on a light track around a lime disc. */
export function Ring({ rate, size = 132, caption }: { rate: number | null; size?: number; caption?: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const filled = rate === null ? 0 : Math.max(0, Math.min(1, rate)) * c;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`Hit rate ${fmtPct(rate)}`}>
        <circle cx="60" cy="60" r="34" fill="#dfee6b" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#d9d7d0" strokeWidth="8" />
        {rate !== null && (
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="#2e2e2c"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c}`}
            transform="rotate(-90 60 60)"
          />
        )}
        <text x="60" y="66" textAnchor="middle" fontSize="20" fontWeight="400" fill="#1f1f1d">
          {fmtPct(rate)}
        </text>
      </svg>
      {caption && <p className="adm-muted text-xs leading-relaxed">{caption}</p>}
    </div>
  );
}
