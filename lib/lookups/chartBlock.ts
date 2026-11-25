import { SIGNS } from "@/lib/astrology/constants";

/**
 * A chart drawn in a reading. It travels, and is stored, as a few plain lines
 * at the head of the reply: an app that can draw them does, an older one shows
 * a short list, and a reopened reading draws it again. Written only by code;
 * Astrya's own history has it taken out, so it never learns to write one.
 * Client-safe. Mirrored on iOS by `ChartBlock.swift`.
 *
 *   **Chart D9 (Asha)**
 *   - 1 Taurus: Moon, Jupiter (R)
 *   - 2 Gemini: -
 */
export type DrawnHouse = { house: number; sign: string; items: string[] };
export type ChartBlock =
  | { kind: "chart"; id: string; name: string; houses: DrawnHouse[] }
  | { kind: "dasha"; id: "Dasha"; name: string; periods: { lord: string; start: string; end: string }[] };

const cleanName = (name: string) => name.replace(/[*()\n\r\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
const heading = (id: string, name: string) => `**Chart ${id} (${cleanName(name) || "-"})**`;

export function writeChart(id: string, name: string, houses: DrawnHouse[]): string {
  return [heading(id, name), ...houses.map((h) => `- ${h.house} ${h.sign}: ${h.items.join(", ") || "-"}`)].join("\n");
}

export function writeDasha(name: string, periods: { lord: string; start: string; end: string }[]): string {
  return [heading("Dasha", name), ...periods.map((p) => `- ${p.lord}: ${p.start} to ${p.end}`)].join("\n");
}

const HEAD = /^\*\*Chart (D\d{1,2}|Moon|SAV|Dasha) \(([^*()]*)\)\*\*$/;
const HOUSE = /^- (\d{1,2}) ([A-Z][a-z]+): (.+)$/;
const PERIOD = /^- ([A-Z][a-z]+): (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/;

/** The reply in order: prose and the charts in it. A block still arriving is held back. */
export function splitCharts(content: string): (string | ChartBlock)[] {
  const out: (string | ChartBlock)[] = [];
  const lines = content.split("\n");
  let prose: string[] = [];
  const flush = () => {
    if (prose.join("").trim()) out.push(prose.join("\n"));
    prose = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const head = HEAD.exec(lines[i]);
    if (!head) {
      prose.push(lines[i]);
      continue;
    }
    const [, id, name] = head;
    const rows: string[] = [];
    while (i + 1 + rows.length < lines.length && lines[i + 1 + rows.length].startsWith("- ")) rows.push(lines[i + 1 + rows.length]);
    const block = id === "Dasha" ? readDasha(name, rows) : readHouses(id, name, rows);
    if (!block) {
      // Cut short by the stream: say nothing yet. Anything else is prose.
      if (lines.slice(i + 1 + rows.length).every((l) => l === "" || l === "-")) break;
      prose.push(lines[i]);
      continue;
    }
    flush();
    out.push(block);
    i += rows.length;
  }
  flush();
  return out;
}

function readHouses(id: string, name: string, rows: string[]): ChartBlock | null {
  if (rows.length !== 12) return null;
  const houses: DrawnHouse[] = [];
  for (const [i, row] of rows.entries()) {
    const m = HOUSE.exec(row);
    if (!m || Number(m[1]) !== i + 1 || !(SIGNS as readonly string[]).includes(m[2])) return null;
    houses.push({ house: i + 1, sign: m[2], items: m[3] === "-" ? [] : m[3].split(", ") });
  }
  return { kind: "chart", id, name, houses };
}

function readDasha(name: string, rows: string[]): ChartBlock | null {
  const periods = rows.map((r) => PERIOD.exec(r));
  if (periods.length < 2 || periods.some((m) => !m)) return null;
  return { kind: "dasha", id: "Dasha", name, periods: periods.map((m) => ({ lord: m![1], start: m![2], end: m![3] })) };
}

/** The reply as Astrya and its memory read it: which chart was drawn, not the drawing. */
export function withoutCharts(content: string): string {
  if (!content.includes("**Chart ")) return content;
  return splitCharts(content)
    .map((part) => (typeof part === "string" ? part.trim() : `[The app drew ${part.name}'s ${part.id} chart here.]`))
    .join("\n\n");
}
