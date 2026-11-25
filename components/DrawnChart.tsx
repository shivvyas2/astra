"use client";
import { planet as planetName, vedicSign } from "@/lib/i18n/astro";
import { useI18n } from "@/lib/i18n/client";
import type { ChartBlock } from "@/lib/lookups/chartBlock";
import { signIndex } from "@/lib/astrology/constants";

/** A chart inside a reading: the North Indian kundli, or the dasha timeline. */
export function DrawnChart({ block }: { block: ChartBlock }) {
  const { t, f } = useI18n();
  const c = t.chat.chart;
  const titles: Record<string, string> = c.titles;
  const title = titles[block.id] ?? f(c.divisional, { id: block.id });
  return (
    <figure className="brut-card mb-4 max-w-sm p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium text-fg">{title}</span>
        {block.name !== "-" && <span className="text-muted">{block.name}</span>}
      </figcaption>
      {block.kind === "dasha" ? <Dashas periods={block.periods} /> : <Kundli block={block} />}
    </figure>
  );
}

/** Where each house's contents sit, on a 100-unit square. */
const ANCHOR: [number, number][] = [
  [50, 26], [26, 11.5], [11.5, 26], [26, 50], [11.5, 74], [26, 88.5],
  [50, 74], [74, 88.5], [88.5, 74], [74, 50], [88.5, 26], [74, 11.5],
];

function Kundli({ block }: { block: Extract<ChartBlock, { kind: "chart" }> }) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const c = t.chat.chart;
  const points = block.id === "SAV";
  const short: Record<string, string> = c.short;
  const label = (item: string) => (points ? item : (short[item.replace(" (R)", "")] ?? item) + (item.endsWith("(R)") ? "ᴿ" : ""));
  const spoken = block.houses
    .map((h) => {
      const what = points
        ? f(c.points, { count: h.items[0] ?? "0" })
        : h.items.map((x) => planetName(i18n, x.replace(" (R)", ""))).join(", ") || c.empty;
      return `${f(c.house, { n: String(h.house), sign: vedicSign(i18n, h.sign) })}: ${what}`;
    })
    .join(". ");
  return (
    <svg viewBox="0 0 100 100" className="w-full" role="img" aria-label={spoken}>
      <path d="M50 1L74.5 25.5L50 50L25.5 25.5Z" fill="var(--accent)" opacity="0.1" />
      <path className="chart-ink" pathLength={1} d="M1 1H99V99H1ZM1 1L99 99M99 1L1 99M50 1L99 50L50 99L1 50Z" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="0.5" strokeLinejoin="round" />
      {block.houses.map((h, i) => {
        const [x, y] = ANCHOR[i];
        // Two to a row, so a crowded house stays inside its lines.
        const rows: string[] = [];
        for (let k = 0; k < h.items.length; k += 2) rows.push(h.items.slice(k, k + 2).map(label).join(" "));
        const size = rows.length > 1 ? 3.8 : 4.5;
        const line = size + 0.3;
        const top = y - (rows.length * line) / 2;
        return (
          <g key={h.house} textAnchor="middle">
            <text x={x} y={top + 1} fontSize="3.2" fill={i === 0 ? "var(--accent)" : "var(--muted)"}>{signIndex(h.sign) + 1}</text>
            {rows.map((row, r) => (
              <text key={r} x={x} y={top + 1.6 + line * (r + 1)} fontSize={size} fontWeight="500" fill="currentColor">{row}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Dashas({ periods }: { periods: { lord: string; start: string; end: string }[] }) {
  const i18n = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const years = (a: string, b: string) => Math.max(1, (Date.parse(b) - Date.parse(a)) / 31_557_600_000);
  return (
    <ol className="space-y-1">
      {periods.map((p) => {
        const now = p.start <= today && today < p.end;
        return (
          <li key={p.start} className="flex items-stretch gap-3 text-sm" aria-current={now || undefined} style={{ minHeight: `${Math.max(26, years(p.start, p.end) * 2.2)}px` }}>
            <span aria-hidden className={`w-1 shrink-0 rounded-full ${now ? "bg-accent" : p.end <= today ? "bg-fg/20" : "bg-fg/50"}`} />
            <span className={`flex-1 self-center ${now ? "font-medium text-accent" : ""}`}>{planetName(i18n, p.lord)}{now ? ` · ${i18n.t.chat.chart.now}` : ""}</span>
            <span className="self-center tabular-nums text-muted">{p.start.slice(0, 7)} – {p.end.slice(0, 7)}</span>
          </li>
        );
      })}
    </ol>
  );
}
