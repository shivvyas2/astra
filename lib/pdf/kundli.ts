import "server-only";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Chart } from "@/lib/astrology/types";
import { SIGNS } from "@/lib/astrology/constants";

/**
 * The kundli, as a document worth keeping.
 *
 * A birth chart is not a report; in most families it is a piece of paper that
 * gets kept, and this is the version people print, mail to a relative, or hand
 * to an astrologer. So it is set like a document — a serif for the name and the
 * data, a sans for labels, and one accent used sparingly — rather than like a
 * screen that happened to be exported.
 *
 * Two pages, in the order the questions get asked. Page one is the diagram and
 * the three values a chart is identified by. Page two is the full table.
 */

/** The abbreviations printed inside the houses. */
const ABBR: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mercury: "Me", Venus: "Ve", Mars: "Ma",
  Jupiter: "Ju", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke",
};

/**
 * The Sanskrit rashi names, in zodiacal order.
 *
 * The ephemeris returns Western sign names because that is what it computes in;
 * a North Indian chart labelled "Scorpio" reads as a translation of someone
 * else's diagram. Both appear — Sanskrit where the chart is the subject,
 * English beside it so nothing is lost.
 */
const RASHI = [
  "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
  "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena",
];

/**
 * What each bhava is looked up for. Kept short and concrete — a legend, not a
 * reading. These are the same lines the app shows when a house is tapped
 * (`KundliHouse.domain`), so the paper and the screen say the same thing.
 */
const BHAVA_MEANING = [
  "Self, body, how you begin",
  "Money, speech, family",
  "Courage, siblings, effort",
  "Home, mother, peace of mind",
  "Children, learning, creativity",
  "Work, health, obstacles",
  "Partnership, marriage, others",
  "Change, inheritance, the hidden",
  "Fortune, father, belief",
  "Career, standing, action",
  "Gains, networks, hopes",
  "Loss, release, what is spent",
];

/**
 * The twelve house regions of a North Indian chart, as unit coordinates with y
 * running up, which is pdf-lib's convention.
 *
 * Houses sit in fixed places and the rashis rotate through them — the one rule
 * the whole diagram rests on. These are the same twelve polygons the iOS app
 * draws (`KundliGeometry`), expressed for the other coordinate system.
 */
const HOUSE_POLY: [number, number][][] = [
  [[0.25, 0.75], [0.5, 1], [0.75, 0.75], [0.5, 0.5]],   // 1  top kite
  [[0, 1], [0.5, 1], [0.25, 0.75]],                      // 2
  [[0, 1], [0.25, 0.75], [0, 0.5]],                      // 3
  [[0, 0.5], [0.25, 0.75], [0.5, 0.5], [0.25, 0.25]],    // 4  left kite
  [[0, 0.5], [0.25, 0.25], [0, 0]],                      // 5
  [[0, 0], [0.25, 0.25], [0.5, 0]],                      // 6
  [[0.25, 0.25], [0.5, 0], [0.75, 0.25], [0.5, 0.5]],    // 7  bottom kite
  [[0.5, 0], [0.75, 0.25], [1, 0]],                      // 8
  [[1, 0], [0.75, 0.25], [1, 0.5]],                      // 9
  [[1, 0.5], [0.75, 0.75], [0.5, 0.5], [0.75, 0.25]],    // 10 right kite
  [[1, 0.5], [0.75, 0.75], [1, 1]],                      // 11
  [[1, 1], [0.75, 0.75], [0.5, 1]],                      // 12
];

/**
 * Where a house's contents are centred.
 *
 * The centroid is right for the four kites. A triangle's centroid sits
 * two-thirds of the way out towards its long outer edge, so contents centred
 * there overhang the border — the same trap the app's chart fell into on its
 * first render. Triangles are pulled back towards the middle.
 */
function anchor(house: number): [number, number] {
  const points = HOUSE_POLY[house - 1];
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  if (points.length !== 3) return [cx, cy];
  const pullIn = 0.14;
  return [cx + (0.5 - cx) * pullIn, cy + (0.5 - cy) * pullIn];
}

export type KundliInput = {
  name: string;
  birthDate: string;
  birthTime: string;
  place: string;
  timezone: string;
  chart: Chart; // the vedic chart
  numerology: { mulank: number; bhagyank: number; namank: number };
};

// The brand orange is 3.3:1 on white — fine for a rule or a fill, short of the
// 4.5:1 that text under 18pt needs. Ink-side text uses the darkened variant,
// which is 5.3:1, and the bright one is kept for the marks that carry no words.
const ACCENT = rgb(0.91, 0.4, 0.24); // #e8663d — rules and fills only
const ACCENT_TEXT = rgb(0.72, 0.27, 0.12); // #b8461f — 5.3:1 on white
const INK = rgb(0.1, 0.1, 0.11);
const MUTED = rgb(0.43, 0.42, 0.39); // #6e6a63 — 5.4:1 on white
const RULE = rgb(0.85, 0.84, 0.82);
// The chart's inner rules. Full ink at 1.2pt — the first draft — drew a heavy
// black cage around type set at 9pt, and the diagram fought the page instead of
// sitting on it. The border stays ink; everything inside it steps back.
const GRID = rgb(0.55, 0.54, 0.52);
const TINT = rgb(0.972, 0.968, 0.96);

const W = 595;
const H = 842;
const M = 56;

type Fonts = { serif: PDFFont; serifBold: PDFFont; sans: PDFFont; sansBold: PDFFont };

/** Letterspaced small capitals, drawn a character at a time — pdf-lib has no
 * character-spacing control, and an un-tracked 8pt uppercase label reads as a
 * mistake rather than a label. */
function tracked(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = MUTED,
  spacing = 1.6,
) {
  let cursor = x;
  for (const character of text) {
    page.drawText(character, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(character, size) + spacing;
  }
  return cursor - x - spacing;
}

function trackedWidth(text: string, size: number, font: PDFFont, spacing = 1.6) {
  return [...text].reduce((w, c) => w + font.widthOfTextAtSize(c, size) + spacing, 0) - spacing;
}

/** `14°32'` — how every printed kundli gives a position, and far more use than
 * a rounded whole degree when two grahas share a sign. */
function degreeText(degree: number) {
  const whole = Math.floor(degree);
  const minutes = Math.floor((degree - whole) * 60);
  return `${whole}°${String(minutes).padStart(2, "0")}'`;
}

function rashiOf(sign: string) {
  const index = SIGNS.indexOf(sign as (typeof SIGNS)[number]);
  return index < 0 ? { sanskrit: sign, english: sign, number: 0 } : {
    sanskrit: RASHI[index],
    english: SIGNS[index],
    number: index + 1,
  };
}

/**
 * `12 September 1994`.
 *
 * Exported for the test, not for callers: the UTC pinning below is the kind of
 * thing that silently regresses, and it cannot be asserted through the finished
 * PDF because pdf-lib compresses its content streams.
 */
export function prettyDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  // Constructed in UTC and read back in UTC: a bare date formatted in a local
  // zone west of Greenwich comes back as the day before.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/** `Apr 2032`. Exported for the same reason as `prettyDate`. */
export function shortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** The running head and the rule under it, on every page. */
function header(page: PDFPage, fonts: Fonts, right: string) {
  page.drawRectangle({ x: 0, y: H - 4, width: W, height: 4, color: ACCENT });
  tracked(page, "ASTRYA", M, H - 30, 9, fonts.sansBold, INK, 2.4);
  const width = trackedWidth(right, 8, fonts.sans, 1.8);
  tracked(page, right, W - M - width, H - 29, 8, fonts.sans, MUTED, 1.8);
  page.drawLine({
    start: { x: M, y: H - 42 }, end: { x: W - M, y: H - 42 },
    thickness: 0.75, color: RULE,
  });
}

function footer(page: PDFPage, fonts: Fonts, note: string) {
  page.drawLine({
    start: { x: M, y: 58 }, end: { x: W - M, y: 58 },
    thickness: 0.75, color: RULE,
  });
  page.drawText(note, { x: M, y: 44, size: 7.5, font: fonts.sans, color: MUTED });
}

/** A section heading: a tracked label with a short accent rule beside it. */
function section(page: PDFPage, fonts: Fonts, label: string, y: number) {
  const width = tracked(page, label, M, y, 8.5, fonts.sansBold, ACCENT_TEXT, 2.2);
  page.drawLine({
    start: { x: M + width + 12, y: y + 3 }, end: { x: W - M, y: y + 3 },
    thickness: 0.75, color: RULE,
  });
}

/** The three values a chart is identified by, in one band. */
function identityBand(page: PDFPage, fonts: Fonts, chart: Chart, y: number) {
  const height = 62;
  page.drawRectangle({ x: M, y: y - height, width: W - 2 * M, height, color: TINT });
  page.drawRectangle({ x: M, y: y - height, width: 3, height, color: ACCENT });

  const lagna = rashiOf(chart.ascendant.sign);
  const moon = rashiOf(chart.moonSign);
  const sun = rashiOf(chart.sunSign);
  const cells: [string, string, string][] = [
    ["LAGNA", lagna.sanskrit, `${lagna.english} · ${degreeText(chart.ascendant.degree)}`],
    ["CHANDRA", moon.sanskrit, moon.english],
    ["SURYA", sun.sanskrit, sun.english],
  ];

  const inner = W - 2 * M - 3;
  const column = inner / 3;
  cells.forEach(([label, value, caption], index) => {
    const centre = M + 3 + column * index + column / 2;
    if (index > 0) {
      page.drawLine({
        start: { x: M + 3 + column * index, y: y - height + 14 },
        end: { x: M + 3 + column * index, y: y - 14 },
        thickness: 0.75, color: RULE,
      });
    }
    const labelWidth = trackedWidth(label, 7.5, fonts.sansBold, 1.8);
    tracked(page, label, centre - labelWidth / 2, y - 20, 7.5, fonts.sansBold, MUTED, 1.8);

    const valueWidth = fonts.serifBold.widthOfTextAtSize(value, 15);
    page.drawText(value, {
      x: centre - valueWidth / 2, y: y - 39, size: 15, font: fonts.serifBold, color: INK,
    });

    const captionWidth = fonts.sans.widthOfTextAtSize(caption, 8);
    page.drawText(caption, {
      x: centre - captionWidth / 2, y: y - 52, size: 8, font: fonts.sans, color: MUTED,
    });
  });
}

/** The chart square itself. */
function drawChart(page: PDFPage, fonts: Fonts, chart: Chart, x0: number, y0: number, size: number) {
  const px = (fx: number, fy: number) => ({ x: x0 + fx * size, y: y0 + fy * size });
  const line = (a: [number, number], b: [number, number], thickness = 0.6, color = GRID) =>
    page.drawLine({ start: px(...a), end: px(...b), thickness, color });

  // The lagna house gets the faintest wash, so the chart's orientation is
  // legible at a glance without a caption pointing at it.
  const lagnaPoints = HOUSE_POLY[0].map(([fx, fy]) => px(fx, fy));
  page.drawSvgPath(
    `M ${lagnaPoints.map((p) => `${p.x} ${H - p.y}`).join(" L ")} Z`,
    { x: 0, y: H, color: rgb(0.98, 0.93, 0.9), borderWidth: 0 },
  );

  line([0, 0], [1, 0], 1, INK); line([1, 0], [1, 1], 1, INK);
  line([1, 1], [0, 1], 1, INK); line([0, 1], [0, 0], 1, INK);
  line([0, 0], [1, 1]); line([1, 0], [0, 1]);
  line([0.5, 0], [1, 0.5]); line([1, 0.5], [0.5, 1]);
  line([0.5, 1], [0, 0.5]); line([0, 0.5], [0.5, 0]);

  const ascIndex = SIGNS.indexOf(chart.ascendant.sign as (typeof SIGNS)[number]);
  for (let house = 1; house <= 12; house++) {
    const [fx, fy] = anchor(house);
    const centre = px(fx, fy);
    const rashiNumber = ((Math.max(ascIndex, 0) + house - 1) % 12) + 1;
    const isLagna = house === 1;

    const numeral = String(rashiNumber);
    const numeralWidth = fonts.serif.widthOfTextAtSize(numeral, 9);
    page.drawText(numeral, {
      x: centre.x - numeralWidth / 2, y: centre.y + 7, size: 9,
      font: fonts.serif, color: isLagna ? ACCENT_TEXT : MUTED,
    });

    const here = chart.planets.filter((p) => p.house === house);
    if (!here.length) continue;

    // Two to a row: a four-graha house has to fit inside the narrowest triangle
    // without the abbreviations shrinking below legibility.
    for (let row = 0; row * 2 < here.length; row++) {
      const cells = here.slice(row * 2, row * 2 + 2);
      const label = cells
        // Plain ASCII on purpose: the standard PDF fonts are WinAnsi-encoded,
        // and pdf-lib throws on a character outside it rather than substituting
        // one. The retrograde sign and the superscript r are both outside it.
        .map((p) => `${ABBR[p.name] ?? p.name.slice(0, 2)}${p.retrograde ? "*" : ""} ${Math.floor(p.degree)}°`)
        .join("   ");
      const width = fonts.sansBold.widthOfTextAtSize(label, 7.5);
      page.drawText(label, {
        x: centre.x - width / 2, y: centre.y - 5 - row * 11, size: 7.5,
        font: fonts.sansBold, color: INK,
      });
    }
  }
}

export async function generateKundliPdf(input: KundliInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  doc.setTitle(`${input.name} — Vedic kundli`);
  doc.setAuthor("Astrya");
  doc.setSubject("Vedic birth chart");

  // ---- Page 1: who, and the chart ------------------------------------------
  const p1 = doc.addPage([W, H]);
  header(p1, fonts, "VEDIC KUNDLI");

  let y = H - 88;
  p1.drawText(input.name, { x: M, y, size: 27, font: fonts.serifBold, color: INK });

  y -= 20;
  p1.drawText(`Born ${prettyDate(input.birthDate)} at ${input.birthTime}`, {
    x: M, y, size: 9.5, font: fonts.sans, color: MUTED,
  });
  y -= 13;
  const provenance = input.chart.ayanamsa
    ? `${input.place} · ${input.timezone} · Lahiri ayanamsa ${input.chart.ayanamsa.toFixed(2)}°`
    : `${input.place} · ${input.timezone}`;
  p1.drawText(provenance, { x: M, y, size: 9.5, font: fonts.sans, color: MUTED });

  y -= 34;
  identityBand(p1, fonts, input.chart, y);

  // The square, centred in what is left, with room for its caption.
  const chartSize = 414;
  const chartX = (W - chartSize) / 2;
  const chartY = 168;
  drawChart(p1, fonts, input.chart, chartX, chartY, chartSize);

  const caption = "Houses hold fixed positions — the top diamond is always the first.";
  const caption2 = "The numeral in each house is its rashi, 1 Mesha to 12 Meena. * marks a retrograde graha.";
  for (const [index, text] of [caption, caption2].entries()) {
    const width = fonts.sans.widthOfTextAtSize(text, 8.5);
    p1.drawText(text, {
      x: (W - width) / 2, y: chartY - 26 - index * 12, size: 8.5,
      font: fonts.sans, color: MUTED,
    });
  }

  footer(p1, fonts, "Computed with the Swiss Ephemeris by Astrya. For guidance and reflection, not a substitute for professional advice.");

  // ---- Page 2: the table ---------------------------------------------------
  const p2 = doc.addPage([W, H]);
  header(p2, fonts, input.name.toUpperCase());

  y = H - 86;
  section(p2, fonts, "GRAHAS AND NAKSHATRAS", y);

  y -= 22;
  const columns = { graha: M, rashi: M + 104, degree: M + 214, house: M + 274, nak: M + 324 };
  const headings: [string, number][] = [
    ["GRAHA", columns.graha], ["RASHI", columns.rashi], ["DEGREE", columns.degree],
    ["HOUSE", columns.house], ["NAKSHATRA", columns.nak],
  ];
  for (const [label, x] of headings) {
    tracked(p2, label, x, y, 7, fonts.sansBold, MUTED, 1.4);
  }

  y -= 8;
  p2.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: RULE });

  const rowHeight = 19;
  input.chart.planets.forEach((planet, index) => {
    const top = y - index * rowHeight;
    // A tint on alternate rows does the work five vertical rules would.
    if (index % 2 === 1) {
      p2.drawRectangle({
        x: M - 6, y: top - rowHeight - 1, width: W - 2 * M + 12, height: rowHeight, color: TINT,
      });
    }
    const baseline = top - 13;
    const rashi = rashiOf(planet.sign);
    const cells: [string, number, PDFFont, ReturnType<typeof rgb>][] = [
      [`${ABBR[planet.name] ?? ""}  ${planet.name}${planet.retrograde ? " (R)" : ""}`, columns.graha, fonts.sans, INK],
      [rashi.sanskrit, columns.rashi, fonts.serif, INK],
      [degreeText(planet.degree), columns.degree, fonts.serif, INK],
      [String(planet.house), columns.house, fonts.serif, INK],
      [planet.nakshatra ?? "—", columns.nak, fonts.sans, MUTED],
    ];
    for (const [text, x, font, color] of cells) {
      p2.drawText(text, { x, y: baseline, size: 9, font, color });
    }
  });

  y -= input.chart.planets.length * rowHeight + 34;

  // The houses, read the other way round.
  //
  // The graha table answers "where is Saturn"; this one answers "what's in my
  // seventh", which is the question people bring to a printed chart far more
  // often. It is also what fills the lower half of this page, which the first
  // draft left empty — space a keepsake document should not have.
  section(p2, fonts, "BHAVAS", y);

  y -= 22;
  const bhavaColumns = { number: M, rashi: M + 46, grahas: M + 148, means: M + 250 };
  const bhavaHeadings: [string, number][] = [
    ["BHAVA", bhavaColumns.number], ["RASHI", bhavaColumns.rashi],
    ["GRAHAS", bhavaColumns.grahas], ["SIGNIFIES", bhavaColumns.means],
  ];
  for (const [label, x] of bhavaHeadings) {
    tracked(p2, label, x, y, 7, fonts.sansBold, MUTED, 1.4);
  }

  y -= 8;
  p2.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: RULE });

  const bhavaHeight = 17;
  const ascendantIndex = Math.max(SIGNS.indexOf(input.chart.ascendant.sign as (typeof SIGNS)[number]), 0);
  for (let house = 1; house <= 12; house++) {
    const top = y - (house - 1) * bhavaHeight;
    if (house % 2 === 0) {
      p2.drawRectangle({
        x: M - 6, y: top - bhavaHeight - 1, width: W - 2 * M + 12, height: bhavaHeight, color: TINT,
      });
    }
    const baseline = top - 12;
    const rashi = RASHI[(ascendantIndex + house - 1) % 12];
    const here = input.chart.planets
      .filter((p) => p.house === house)
      .map((p) => p.name)
      .join(", ");
    const cells: [string, number, PDFFont, ReturnType<typeof rgb>][] = [
      [house === 1 ? "1 · Lagna" : String(house), bhavaColumns.number, fonts.serif, house === 1 ? ACCENT_TEXT : INK],
      [rashi, bhavaColumns.rashi, fonts.serif, INK],
      [here || "—", bhavaColumns.grahas, fonts.sans, here ? INK : MUTED],
      [BHAVA_MEANING[house - 1], bhavaColumns.means, fonts.sans, MUTED],
    ];
    for (const [text, x, font, color] of cells) {
      p2.drawText(text, { x, y: baseline, size: 8.5, font, color });
    }
  }

  y -= 12 * bhavaHeight + 34;

  if (input.chart.dasha) {
    section(p2, fonts, "VIMSHOTTARI DASHA", y);
    y -= 24;
    const periods: [string, string, string][] = [
      ["Mahadasha", input.chart.dasha.mahadasha, `${shortDate(input.chart.dasha.mahadashaStart)} — ${shortDate(input.chart.dasha.mahadashaEnd)}`],
      ["Antardasha", input.chart.dasha.antardasha, `${shortDate(input.chart.dasha.antardashaStart)} — ${shortDate(input.chart.dasha.antardashaEnd)}`],
    ];
    for (const [label, lord, span] of periods) {
      p2.drawText(label, { x: M, y, size: 9, font: fonts.sans, color: MUTED });
      p2.drawText(lord, { x: M + 104, y: y - 1, size: 12, font: fonts.serifBold, color: INK });
      const width = fonts.sans.widthOfTextAtSize(span, 9);
      p2.drawText(span, { x: W - M - width, y, size: 9, font: fonts.sans, color: MUTED });
      y -= 24;
    }
    y -= 12;
  }

  section(p2, fonts, "NUMEROLOGY", y);
  y -= 24;
  const numbers: [string, number, string][] = [
    ["MULANK", input.numerology.mulank, "Root, from the day of birth"],
    ["BHAGYANK", input.numerology.bhagyank, "Destiny, from the whole date"],
    ["NAMANK", input.numerology.namank, "Name, from its letters"],
  ];
  const column = (W - 2 * M) / 3;
  numbers.forEach(([label, value, note], index) => {
    const x = M + column * index;
    tracked(p2, label, x, y, 7.5, fonts.sansBold, MUTED, 1.8);
    p2.drawText(String(value), { x, y: y - 26, size: 22, font: fonts.serifBold, color: ACCENT_TEXT });
    p2.drawText(note, { x: x + 22, y: y - 26, size: 8, font: fonts.sans, color: MUTED });
  });

  footer(p2, fonts, `Astrya · ${input.name} · born ${prettyDate(input.birthDate)} at ${input.birthTime}, ${input.place}`);

  return doc.save();
}
