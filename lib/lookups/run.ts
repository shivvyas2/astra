import { DateTime } from "luxon";
import { ashtakavarga, describeAshtakavarga } from "@/lib/astrology/ashtakavarga";
import { signIndex, SIGNS } from "@/lib/astrology/constants";
import { vimshottariTimeline, type DashaPeriod } from "@/lib/astrology/dasha";
import { describeSadeSati, moonIsCertain } from "@/lib/astrology/saturn";
import type { Chart } from "@/lib/astrology/types";
import { describeVarga, vargaChart, VARGAS, type Varga } from "@/lib/astrology/vargas";
import { ACTIVITIES, describeMuhurat, MAX_DAYS, natalStars, type Activity } from "@/lib/panchang/muhurat";
import { moonLongitudeFrom } from "@/lib/timeline/build";
import type { GeoResult } from "@/lib/geo";
import { writeChart, writeDasha, type DrawnHouse } from "./chartBlock";
import { TOPICS, type LookupTopic } from "./tool";

/** Someone whose chart is in the conversation. */
export type Subject = { name: string; chart: Chart; birthDate: string; birthTime: string; timezone: string; place: { name: string; lat: number; lng: number } };
export type LookupResult = { content: string; error?: boolean; /** Charts to draw, in order, for the reply's head. */ blocks: string[] };

export type LookupInput = { topics: LookupTopic[]; whose: "self" | "other" | "both"; draw: boolean; activity: Activity; from: string | null; to: string | null; place: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && DateTime.fromISO(v).isValid;

/** Null when it did not arrive in the right shape. */
export function readLookup(input: unknown): LookupInput | null {
  const o = (input ?? {}) as Record<string, unknown>;
  const topics = Array.isArray(o.topics) ? [...new Set(o.topics)].filter((t): t is LookupTopic => (TOPICS as readonly unknown[]).includes(t)) : [];
  if (!topics.length) return null;
  return {
    topics: topics.slice(0, 6),
    whose: o.whose === "other" || o.whose === "both" ? o.whose : "self",
    draw: o.draw === true,
    activity: (ACTIVITIES as readonly unknown[]).includes(o.activity) ? (o.activity as Activity) : "general",
    from: isDate(o.from) ? o.from : null,
    to: isDate(o.to) ? o.to : null,
    place: typeof o.place === "string" && o.place.trim() ? o.place.trim().slice(0, 120) : null,
  };
}

const MAX_BLOCKS = 3;

export async function runLookup(
  input: LookupInput,
  ctx: { self: Subject; other: Subject | null; today: string; find: (place: string) => Promise<GeoResult[]> },
): Promise<LookupResult> {
  if (input.whose !== "self" && !ctx.other) {
    return { content: "There is no second person's chart in this conversation. Use propose_match or use_saved_person first.", error: true, blocks: [] };
  }
  const people = [...(input.whose !== "other" ? [ctx.self] : []), ...(input.whose !== "self" ? [ctx.other!] : [])];
  const out: string[] = [];
  const blocks: string[] = [];

  for (const who of people) {
    for (const topic of input.topics) {
      if (topic === "muhurat") continue;
      const { text, block } = await one(topic, who, ctx.today);
      out.push(`${who.name}'s ${text}`);
      if (input.draw && block && blocks.length < MAX_BLOCKS) blocks.push(block);
    }
  }
  if (input.topics.includes("muhurat")) out.push(await muhurat(input, ctx));
  if (input.draw) {
    out.push(
      blocks.length
        ? `Drawn on their screen, above your words: ${blocks.map((b) => b.slice(2, b.indexOf("**", 2))).join("; ")}.`
        : "Nothing could be drawn for this. Say so in a few words.",
    );
  }
  out.push("Answer their question now from this and the chart, in the language and script of their newest message (Hindi or Gujarati in English letters is answered the same way).");
  return { content: out.join("\n\n"), blocks };
}

const NEEDS_TIME = "needs an exact birth time, which is not known. Say so in one sentence and suggest adding it in the profile; read what the signs do show.";

async function one(topic: LookupTopic, who: Subject, today: string): Promise<{ text: string; block?: string }> {
  const { chart, name } = who;
  if ((VARGAS as readonly string[]).includes(topic)) {
    const v = vargaChart(chart, topic as Varga);
    if (!v) return { text: `${topic} ${NEEDS_TIME}` };
    return { text: describeVarga(v), block: writeChart(v.varga, name, houses(v.ascendant, v.planets)) };
  }
  if (topic === "D1") {
    // Without a birth time it is drawn from the Moon, as the Kundli page does.
    const known = chart.timeKnown !== false;
    const block = writeChart(known ? "D1" : "Moon", name, houses(known ? chart.ascendant.sign : chart.moonSign, chart.planets));
    return { text: known ? "birth chart is the one in your instructions." : "birth time is unknown, so the chart is drawn with the Moon's sign first. Say so once.", block };
  }
  if (topic === "ashtakavarga") {
    const av = ashtakavarga(chart);
    if (!av) return { text: `ashtakavarga ${NEEDS_TIME}` };
    const asc = signIndex(av.ascendant);
    const rows = Array.from({ length: 12 }, (_, i): DrawnHouse => ({ house: i + 1, sign: SIGNS[(asc + i) % 12], items: [String(av.sarva[(asc + i) % 12])] }));
    return { text: describeAshtakavarga(av), block: writeChart("SAV", name, rows) };
  }
  if (topic === "dasha") return dasha(who, today);
  return { text: await describeSadeSati({ moonSign: chart.moonSign, birthDate: who.birthDate, today, moonCertain: moonIsCertain(chart) }) };
}

function houses(ascendant: string, planets: { name: string; sign: string; retrograde: boolean }[]): DrawnHouse[] {
  const asc = signIndex(ascendant);
  return Array.from({ length: 12 }, (_, i) => {
    const sign = SIGNS[(asc + i) % 12];
    return {
      house: i + 1,
      sign,
      items: planets.filter((p) => p.sign === sign).map((p) => (p.retrograde && p.name !== "Rahu" && p.name !== "Ketu" ? `${p.name} (R)` : p.name)),
    };
  });
}

/**
 * Every period, agreeing to the day with the dasha stored on the chart. The
 * Moon is stored to a hundredth of a degree, which is up to three days of
 * dasha, so the thousandths that give the stored dates back are found first.
 */
export function periodsOf(chart: Chart, birth: DateTime): DashaPeriod[] | null {
  const moon = moonLongitudeFrom(chart);
  if (moon === null) return null;
  const want = chart.dasha;
  const plain = vimshottariTimeline(moon, birth);
  if (!want) return plain;
  for (let k = 0; k <= 60; k++) {
    for (const sign of k ? [1, -1] : [1]) {
      const tried = vimshottariTimeline(moon + sign * k * 0.0001, birth);
      const p = tried.find((x) => x.lord === want.mahadasha && x.start === want.mahadashaStart && x.end === want.mahadashaEnd);
      if (p?.antardashas.some((a) => a.lord === want.antardasha && a.start === want.antardashaStart && a.end === want.antardashaEnd)) return tried;
    }
  }
  return plain;
}

/** A hundred years of life is what anyone asks about. */
const YEARS = 100;

function dasha(who: Subject, today: string): { text: string; block?: string } {
  const birth = DateTime.fromISO(`${who.birthDate}T${who.birthTime.slice(0, 5)}`, { zone: who.timezone }).toUTC();
  const all = birth.isValid ? periodsOf(who.chart, birth) : null;
  if (!all) return { text: "dasha dates could not be computed." };
  const periods = all.filter((p) => p.start < birth.plus({ years: YEARS }).toISODate()!);
  const at = periods.findIndex((p) => p.start <= today && today < p.end);
  const lines = [`VIMSHOTTARI DASHA, every main period (a main period's sub-periods follow it):`];
  if (who.chart.timeKnown === false) lines.push("The birth time is unknown, so every date here is approximate and can be off by months or more. Say so once.");
  const subs = (p: DashaPeriod) => p.antardashas.map((a) => `${a.lord} ${a.start} to ${a.end}${a.start <= today && today < a.end ? " (now)" : ""}`).join("; ");
  periods.forEach((p, i) => {
    lines.push(`- ${p.lord}: ${p.start} to ${p.end}${i === at ? " (running now)" : p.end <= today ? " (over)" : ""}. ${subs(p)}`);
  });
  const now = periods[at]?.antardashas.find((a) => a.start <= today && today < a.end);
  if (now) lines.push(`PRATYANTAR inside ${periods[at].lord}-${now.lord}: ${pratyantars(now).join("; ")}`);
  return { text: lines.join("\n"), block: writeDasha(who.name, periods.map((p) => ({ lord: p.lord, start: p.start, end: p.end }))) };
}

const ORDER: [string, number][] = [["Ketu", 7], ["Venus", 20], ["Sun", 6], ["Moon", 10], ["Mars", 7], ["Rahu", 18], ["Jupiter", 16], ["Saturn", 19], ["Mercury", 17]];

/** The nine sub-sub-periods of an antardasha, each its lord's share of 120. */
export function pratyantars(a: { lord: string; start: string; end: string }): string[] {
  const start = DateTime.fromISO(a.start, { zone: "utc" });
  const days = DateTime.fromISO(a.end, { zone: "utc" }).diff(start, "days").days;
  const first = ORDER.findIndex(([l]) => l === a.lord);
  let done = 0;
  return ORDER.map((_, i) => {
    const [lord, years] = ORDER[(first + i) % 9];
    const from = start.plus({ days: (days * done) / 120 });
    done += years;
    return `${lord} ${from.toISODate()} to ${start.plus({ days: (days * done) / 120 }).toISODate()}`;
  });
}

const DEFAULT_DAYS = 60;

async function muhurat(input: LookupInput, ctx: { self: Subject; other: Subject | null; today: string; find: (place: string) => Promise<GeoResult[]> }): Promise<string> {
  const from = input.from && input.from >= ctx.today ? input.from : ctx.today;
  const start = DateTime.fromISO(from, { zone: "utc" });
  const cap = start.plus({ days: MAX_DAYS - 1 }).toISODate()!;
  const asked = input.to && input.to >= from ? input.to : input.to ? from : start.plus({ days: DEFAULT_DAYS - 1 }).toISODate()!;
  const to = asked < cap ? asked : cap;
  let place = { ...ctx.self.place, timezone: ctx.self.timezone };
  let note = input.place ? "" : `They did not say where, so this is for their birthplace. Say so and offer another town.`;
  if (input.place) {
    const found = (await ctx.find(input.place).catch(() => []))[0];
    if (found) place = { name: found.name, lat: found.lat, lng: found.lng, timezone: found.timezone };
    else note = `"${input.place}" could not be found, so this is for their birthplace. Say so and ask for a nearby larger town.`;
  }
  const natals = [natalStars(ctx.self.name, ctx.self.chart)];
  if (ctx.other && (input.whose !== "self" || input.activity === "marriage")) natals.push(natalStars(ctx.other.name, ctx.other.chart));
  const text = await describeMuhurat({ activity: input.activity, from, to, place, natals });
  if (asked > cap) note += ` Only ${MAX_DAYS} days at a time can be checked; offer to look further.`;
  return note ? `${text}\n${note}` : text;
}
