"use client";
import { NAME_SCRIPT_LABEL, NAME_SCRIPTS, planetIn, planetShortIn, signIn, signsIn, type NameScript } from "@/lib/astrology/nameScript";
import { signIndex } from "@/lib/astrology/constants";
import { useChartNames } from "@/components/ChartNamesPicker";
import { useI18n } from "@/lib/i18n/client";
import type { ChartBlock } from "@/lib/lookups/chartBlock";

/**
 * A chart inside a reading: the North Indian kundli, or the dasha timeline,
 * in the names the reader chose, with a key anyone can read it by.
 */
export function DrawnChart({ block }: { block: ChartBlock }) {
  const { t, f } = useI18n();
  const [names, choose] = useChartNames();
  const c = t.chat.chart;
  const titles: Record<string, string> = c.titles;
  const title = titles[block.id] ?? f(c.divisional, { id: block.id });
  return (
    <figure className="brut-card mb-4 max-w-sm p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium text-fg">{title}</span>
        {block.name !== "-" && <span className="text-muted">{block.name}</span>}
      </figcaption>
      {block.kind === "dasha" ? <Dashas periods={block.periods} names={names} /> : <Kundli block={block} names={names} />}
      <details className="group mt-3 border-t border-rule pt-1 text-xs text-muted">
        <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between gap-3 text-sm text-fg [&::-webkit-details-marker]:hidden">
          {t.chartNames.how}
          <span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
        </summary>
        <Key block={block} names={names} />
      </details>
      <label className="mt-1 flex min-h-[44px] items-center justify-between gap-3 border-t border-rule pt-2 text-xs text-muted">
        {t.chartNames.change}
        <select value={names} onChange={(e) => choose(e.target.value as NameScript)} className="cursor-pointer bg-transparent py-2 text-sm text-fg [color-scheme:dark]">
          {NAME_SCRIPTS.map((s) => (
            <option key={s} value={s}>{NAME_SCRIPT_LABEL[s]}</option>
          ))}
        </select>
      </label>
    </figure>
  );
}

/** Where each house's contents sit, on a 100-unit square. */
const ANCHOR: [number, number][] = [
  [50, 26], [26, 11.5], [11.5, 26], [26, 50], [11.5, 74], [26, 88.5],
  [50, 74], [74, 88.5], [88.5, 74], [74, 50], [88.5, 26], [74, 11.5],
];

const bare = (item: string) => item.replace(" (R)", "");

function Kundli({ block, names }: { block: Extract<ChartBlock, { kind: "chart" }>; names: NameScript }) {
  const { t, f } = useI18n();
  const c = t.chat.chart;
  const points = block.id === "SAV";
  const label = (item: string) => (points ? item : planetShortIn(names, bare(item)) + (item.endsWith("(R)") ? "ᴿ" : ""));
  const spoken = block.houses
    .map((h) => {
      const what = points ? f(c.points, { count: h.items[0] ?? "0" }) : h.items.map((x) => planetIn(names, bare(x))).join(", ") || c.empty;
      return `${f(c.house, { n: String(h.house), sign: signIn(names, h.sign) })}: ${what}`;
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

/** Everything printed on the chart, spelled out. */
function Key({ block, names }: { block: ChartBlock; names: NameScript }) {
  const { t } = useI18n();
  const k = t.chartNames;
  if (block.kind === "dasha") return <p className="pb-3 leading-relaxed">{k.dasha}</p>;
  const planets = block.id === "SAV" ? [] : block.houses.flatMap((h) => h.items);
  // English names sit beside the others, so any reader can match them up.
  const full = (name: string) => (names === "english" ? name : `${planetIn(names, name)} (${name})`);
  const signs = signsIn(names);
  const western = signsIn("english");
  return (
    <div className="space-y-2 pb-3 leading-relaxed">
      <p>{block.id === "Moon" ? `${k.moonFirst} ` : ""}{k.houses}</p>
      <p>{k.numbers}</p>
      <ol className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
        {signs.map((s, i) => (
          <li key={s} className="text-fg">
            <span className="tabular-nums text-muted">{i + 1}</span> {s}
            {names !== "english" && <span className="text-muted"> {western[i]}</span>}
          </li>
        ))}
      </ol>
      {block.id === "SAV" ? (
        <p>{k.points}</p>
      ) : (
        <>
          <p>{k.planets}</p>
          <ul className="grid grid-cols-2 gap-x-3">
            {planets.map((p) => (
              <li key={p}><span className="font-medium text-fg">{planetShortIn(names, bare(p))}</span> {full(bare(p))}</li>
            ))}
          </ul>
          {planets.some((p) => p.endsWith("(R)")) && <p>{k.retro}</p>}
        </>
      )}
    </div>
  );
}

function Dashas({ periods, names }: { periods: { lord: string; start: string; end: string }[]; names: NameScript }) {
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const years = (a: string, b: string) => Math.max(1, (Date.parse(b) - Date.parse(a)) / 31_557_600_000);
  return (
    <ol className="space-y-1">
      {periods.map((p) => {
        const now = p.start <= today && today < p.end;
        return (
          <li key={p.start} className="flex items-stretch gap-3 text-sm" aria-current={now || undefined} style={{ minHeight: `${Math.max(26, years(p.start, p.end) * 2.2)}px` }}>
            <span aria-hidden className={`w-1 shrink-0 rounded-full ${now ? "bg-accent" : p.end <= today ? "bg-fg/20" : "bg-fg/50"}`} />
            <span className={`flex-1 self-center ${now ? "font-medium text-accent" : ""}`}>{planetIn(names, p.lord)}{now ? ` · ${t.chat.chart.now}` : ""}</span>
            <span className="self-center tabular-nums text-muted">{p.start.slice(0, 7)} – {p.end.slice(0, 7)}</span>
          </li>
        );
      })}
    </ol>
  );
}
