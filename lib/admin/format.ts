/** Number and date formatting for the admin screens. Pure; safe on server and client. */

const int = new Intl.NumberFormat("en-US");

export function fmtInt(n: number): string {
  return int.format(Math.round(n));
}

/** Compact for big figures: 1,284 / 12.9K / 4.2M. */
export function fmtCompact(n: number): string {
  if (Math.abs(n) < 10_000) return fmtInt(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** USD with precision that suits the size: $0.0123, $0.42, $12.40, $1,204. */
export function fmtUsd(n: number): string {
  const a = Math.abs(n);
  const digits = a === 0 ? 2 : a < 0.01 ? 4 : a < 1 ? 3 : a < 1000 ? 2 : 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtPct(r: number | null): string {
  return r === null ? "—" : `${Math.round(r * 100)}%`;
}

export function fmtDate(iso: string | null | undefined, opts: { time?: boolean; year?: boolean } = {}): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(opts.year === false ? {} : { year: "numeric" }),
    ...(opts.time ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "UTC",
  });
}

/** "3h ago", "2d ago", or a date past a month. */
export function fmtAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const ms = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d}d ago`;
  return fmtDate(iso);
}

export function initials(name: string, email: string): string {
  const parts = (name || email || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** "2026-10-05" as "Oct 5". */
export function fmtDay(day: string): string {
  return fmtDate(`${day}T00:00:00Z`, { year: false });
}
