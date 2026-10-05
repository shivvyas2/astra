"use client";
import { useId, useRef, useState } from "react";
import { fmtDay, fmtInt, fmtUsd } from "@/lib/admin/format";

/**
 * One series over days: a 2px graphite line over a lime wash, a crosshair
 * that snaps to the nearest day with a value readout, and the same numbers
 * as a table behind a toggle (so nothing is hover-only). Single series, so no
 * legend: the card's title names it.
 */
export function AreaChart({
  points,
  label,
  money = false,
  height = 140,
}: {
  points: { day: string; value: number }[];
  label: string;
  money?: boolean;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const gid = useId().replace(/:/g, "");
  const fmt = (v: number) => (money ? fmtUsd(v) : fmtInt(v));

  const W = 600;
  const H = height;
  const n = points.length;
  const max = Math.max(...points.map((p) => p.value), 0);
  const top = max > 0 ? max * 1.15 : 1;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / top) * (H - 8);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = n > 0 ? `${line} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z` : "";

  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setHover(Math.round(t * (n - 1)));
  };

  const at = hover ?? null;
  const pct = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);

  return (
    <div>
      <div
        ref={ref}
        className="adm-chart"
        role="img"
        aria-label={`${label}, ${n} days, peak ${fmt(max)}`}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
          if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
        }}
        style={{ paddingBottom: 0 }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }}>
          <defs>
            <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#dfee6b" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#dfee6b" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <line x1="0" x2={W} y1={H} y2={H} stroke="#c9c6bf" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2={W} y1={y(max)} y2={y(max)} stroke="#dad7d0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {n > 0 && <path d={area} fill={`url(#g${gid})`} />}
          {n > 0 && (
            <path d={line} fill="none" stroke="#2e2e2c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <span className="adm-label" style={{ position: "absolute", left: 0, top: y(max) - 16 }}>
          {fmt(max)}
        </span>
        {n > 0 && at === null && (
          <span className="adm-chart-dot" style={{ left: `${pct(n - 1)}%`, top: y(points[n - 1].value) }} />
        )}
        {at !== null && points[at] && (
          <>
            <span className="adm-chart-cross" style={{ left: `${pct(at)}%`, bottom: 0 }} />
            <span className="adm-chart-dot" style={{ left: `${pct(at)}%`, top: y(points[at].value) }} />
            <span
              className="adm-tip"
              style={{ left: `clamp(48px, ${pct(at)}%, calc(100% - 48px))`, top: Math.max(0, y(points[at].value) - 10) }}
            >
              <b>{fmt(points[at].value)}</b> · {fmtDay(points[at].day)}
            </span>
          </>
        )}
      </div>
      <div className="adm-axis" aria-hidden="true">
        <span>{n ? fmtDay(points[0].day) : ""}</span>
        <span>{n ? fmtDay(points[n - 1].day) : ""}</span>
      </div>
      <details className="adm-table-toggle">
        <summary>Table</summary>
        <table className="adm-mini-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>{label}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.day}>
                <td>{fmtDay(p.day)}</td>
                <td>{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
