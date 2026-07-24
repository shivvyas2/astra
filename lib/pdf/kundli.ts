import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Chart } from "@/lib/astrology/types";
import { SIGNS } from "@/lib/astrology/constants";

const ABBR: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mercury: "Me", Venus: "Ve", Mars: "Ma",
  Jupiter: "Ju", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke",
};

// North Indian house label positions (fractions of the square; y up).
const HOUSE_POS: [number, number][] = [
  [0.5, 0.74], [0.27, 0.9], [0.1, 0.72], [0.27, 0.5], [0.1, 0.28], [0.27, 0.1],
  [0.5, 0.26], [0.73, 0.1], [0.9, 0.28], [0.73, 0.5], [0.9, 0.72], [0.73, 0.9],
];

export type KundliInput = {
  name: string;
  birthDate: string;
  birthTime: string;
  place: string;
  timezone: string;
  chart: Chart; // the vedic chart
  numerology: { mulank: number; bhagyank: number; namank: number };
};

const ACCENT = rgb(0.91, 0.4, 0.24); // #e8663d
const DARK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.42);

export async function generateKundliPdf(input: KundliInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const M = 48; // margin
  let y = 800;

  const text = (s: string, x: number, size: number, f = font, color = DARK) =>
    page.drawText(s, { x, y, size, font: f, color });

  const row = (cols: [string, number][], size: number, f = font, color = DARK) => {
    for (const [s, x] of cols) page.drawText(s, { x, y, size, font: f, color });
  };

  // Header band
  page.drawRectangle({ x: 0, y: 812, width: W, height: 30, color: rgb(0.04, 0.04, 0.06) });
  page.drawText("ASTRA", { x: M, y: 820, size: 14, font: bold, color: rgb(0.96, 0.94, 0.92) });
  page.drawText("Vedic Kundli", { x: M + 62, y: 820, size: 11, font, color: ACCENT });

  y = 778;
  text(input.name, M, 22, bold);
  y -= 20;
  text(`Born ${input.birthDate} at ${input.birthTime} · ${input.place}`, M, 10, font, MUTED);
  y -= 12;
  text(`Timezone ${input.timezone}`, M, 10, font, MUTED);

  // Summary
  y -= 30;
  text("Chart summary", M, 13, bold, ACCENT);
  y -= 18;
  text(`Ascendant (Lagna): ${input.chart.ascendant.sign} ${input.chart.ascendant.degree}°`, M, 11);
  y -= 15;
  text(`Sun sign: ${input.chart.sunSign}    Moon sign: ${input.chart.moonSign}`, M, 11);
  if (input.chart.ayanamsa) {
    y -= 15;
    text(`Ayanamsa (Lahiri): ${input.chart.ayanamsa}°`, M, 11);
  }

  // Planets table
  y -= 30;
  text("Grahas (planets) and Nakshatras", M, 13, bold, ACCENT);
  y -= 18;
  const cols = { name: M, sign: M + 90, deg: M + 190, house: M + 250, nak: M + 310 };
  row(
    [["Graha", cols.name], ["Rashi", cols.sign], ["Degree", cols.deg], ["House", cols.house], ["Nakshatra", cols.nak]],
    9, bold, MUTED,
  );
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 14;
  for (const p of input.chart.planets) {
    row(
      [
        [`${p.name}${p.retrograde ? " (R)" : ""}`, cols.name],
        [p.sign, cols.sign],
        [`${p.degree}°`, cols.deg],
        [String(p.house), cols.house],
        [p.nakshatra ?? "-", cols.nak],
      ],
      10,
    );
    y -= 16;
  }

  // Dasha
  if (input.chart.dasha) {
    y -= 14;
    text("Vimshottari Dasha (current)", M, 13, bold, ACCENT);
    y -= 18;
    text(`Mahadasha: ${input.chart.dasha.mahadasha}  (until ${input.chart.dasha.mahadashaEnd})`, M, 11);
    y -= 15;
    text(`Antardasha: ${input.chart.dasha.antardasha}  (until ${input.chart.dasha.antardashaEnd})`, M, 11);
  }

  // Numerology
  y -= 30;
  text("Numerology", M, 13, bold, ACCENT);
  y -= 18;
  text(`Mulank (root): ${input.numerology.mulank}    Bhagyank (destiny): ${input.numerology.bhagyank}    Namank (name): ${input.numerology.namank}`, M, 11);

  // Footer
  page.drawText("Computed with the Swiss Ephemeris by Astra. For guidance and reflection, not a substitute for professional advice.",
    { x: M, y: 40, size: 8, font, color: MUTED });

  // --- Page 2: North Indian kundli diagram ---
  const p2 = doc.addPage([595, 842]);
  p2.drawText("Kundli chart (North Indian)", { x: M, y: 780, size: 16, font: bold, color: DARK });
  p2.drawText(`Lagna: ${input.chart.ascendant.sign}`, { x: M, y: 758, size: 11, font, color: MUTED });

  const S = 380;
  const x0 = (595 - S) / 2;
  const y0 = 300;
  const line = (ax: number, ay: number, bx: number, by: number) =>
    p2.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 1, color: DARK });
  // Square
  line(x0, y0, x0 + S, y0); line(x0 + S, y0, x0 + S, y0 + S);
  line(x0 + S, y0 + S, x0, y0 + S); line(x0, y0 + S, x0, y0);
  // Diagonals
  line(x0, y0, x0 + S, y0 + S); line(x0 + S, y0, x0, y0 + S);
  // Inner diamond (side midpoints)
  const bm = [x0 + S / 2, y0], rm = [x0 + S, y0 + S / 2], tm = [x0 + S / 2, y0 + S], lm = [x0, y0 + S / 2];
  line(bm[0], bm[1], rm[0], rm[1]); line(rm[0], rm[1], tm[0], tm[1]);
  line(tm[0], tm[1], lm[0], lm[1]); line(lm[0], lm[1], bm[0], bm[1]);

  const ascIdx = SIGNS.indexOf(input.chart.ascendant.sign as (typeof SIGNS)[number]);
  for (let h = 1; h <= 12; h++) {
    const [fx, fy] = HOUSE_POS[h - 1];
    const cx = x0 + fx * S;
    const cy = y0 + fy * S;
    const rashiNo = ((ascIdx + (h - 1)) % 12) + 1; // sign number in this house
    p2.drawText(String(rashiNo), { x: cx - 4, y: cy + 10, size: 8, font, color: MUTED });
    const here = input.chart.planets.filter((p) => p.house === h).map((p) => ABBR[p.name] ?? p.name.slice(0, 2));
    const label = here.join(" ");
    if (label) p2.drawText(label, { x: cx - Math.min(label.length * 3, 28), y: cy - 4, size: 9, font: bold, color: DARK });
  }
  p2.drawText("Numbers are rashi (sign) 1=Aries..12=Pisces. Su Mo Me Ve Ma Ju Sa Ra Ke are the grahas.",
    { x: M, y: 260, size: 8, font, color: MUTED });

  return doc.save();
}
