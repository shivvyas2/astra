import { DateTime } from "luxon";
import { houseFrom, NAKSHATRAS, ORDINAL } from "@/lib/astrology/constants";
import type { Chart } from "@/lib/astrology/types";
import { taraOf } from "@/lib/timing/compare";
import { isGoodChoghadiya, jdOfDateTime, lunarMonth, openSky, panchangDay, type PanchangDay, type Sky, type Span } from "./panchang";

/**
 * Muhurat: the better days in a stretch for one thing, and the hours in them.
 * Panchang shuddhi (tithi, nakshatra, yoga, weekday, Bhadra), the seasons
 * weddings and house entries keep out of, then tara and chandra bala from the
 * person's own Moon. Computed and scored here; a reading only words it.
 */
export const ACTIVITIES = ["marriage", "home", "vehicle", "business", "travel", "education", "general"] as const;
export type Activity = (typeof ACTIVITIES)[number];

const names = (s: string) => new Set(s.split(", "));
const GOOD_NAKSHATRA: Record<Activity, Set<string>> = {
  marriage: names("Rohini, Mrigashira, Magha, Uttara Phalguni, Hasta, Swati, Anuradha, Mula, Uttara Ashadha, Uttara Bhadrapada, Revati"),
  home: names("Rohini, Mrigashira, Uttara Phalguni, Chitra, Anuradha, Uttara Ashadha, Dhanishta, Shatabhisha, Uttara Bhadrapada, Revati"),
  vehicle: names("Ashwini, Rohini, Mrigashira, Punarvasu, Pushya, Hasta, Chitra, Swati, Anuradha, Shravana, Dhanishta, Shatabhisha, Revati"),
  business: names("Ashwini, Rohini, Mrigashira, Punarvasu, Pushya, Uttara Phalguni, Hasta, Chitra, Anuradha, Uttara Ashadha, Uttara Bhadrapada, Revati"),
  travel: names("Ashwini, Mrigashira, Punarvasu, Pushya, Hasta, Anuradha, Shravana, Dhanishta, Revati"),
  education: names("Ashwini, Punarvasu, Pushya, Hasta, Chitra, Swati, Shravana, Dhanishta, Shatabhisha, Revati"),
  general: names("Ashwini, Rohini, Mrigashira, Punarvasu, Pushya, Uttara Phalguni, Hasta, Chitra, Swati, Anuradha, Uttara Ashadha, Shravana, Dhanishta, Shatabhisha, Uttara Bhadrapada, Revati"),
};
const HARD_NAKSHATRA = names("Bharani, Krittika, Ardra, Ashlesha, Purva Phalguni, Vishakha, Jyeshtha, Purva Ashadha, Purva Bhadrapada, Mula, Magha");
const GOOD_TITHI = new Set([2, 3, 5, 7, 10, 11, 13, 17, 18, 20, 22, 25]);
/** Rikta tithis and the new moon. */
const BAD_TITHI = new Set([4, 9, 14, 19, 24, 29, 30]);
const WORST_YOGA = names("Vyatipata, Vaidhriti");
const HARD_YOGA = names("Vishkambha, Atiganda, Shula, Ganda, Vyaghata, Vajra, Parigha");
const GOOD_TARA = new Set(["Sampat", "Kshema", "Sadhana", "Mitra", "Parama Mitra"]);
const BAD_TARA = new Set(["Vipat", "Pratyak", "Naidhana"]);
const GOOD_CHANDRA = [1, 3, 6, 7, 10, 11];

export type MuhuratDay = { day: PanchangDay; score: number; good: string[]; bad: string[]; /** Rules it out altogether. */ stops: string[]; windows: (Span & { name: string })[] };

export const MAX_DAYS = 92;
const TOP = 6;
const GOOD_ENOUGH = 3;

/** Whose stars to weigh the days against; only what their chart is sure of. */
export type Stars = { who: string; moonSign: string | null; nakshatra: string | null };
export function natalStars(who: string, chart: Chart): Stars {
  const unsure = chart.timeKnown === false;
  const nakshatra = chart.planets.find((p) => p.name === "Moon")?.nakshatra ?? null;
  return {
    who,
    moonSign: unsure && chart.moonDay?.changesSign ? null : chart.moonSign,
    nakshatra: unsure && chart.moonDay?.changesNakshatra ? null : nakshatra,
  };
}

/** Degrees between two longitudes, the short way. */
const apart = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Why weddings and house entries are not held in this season. */
function seasonStops(sky: Sky, day: PanchangDay): string[] {
  const jd = jdOfDateTime(day.sunrise);
  const out: string[] = [];
  if (day.sunSign === "Sagittarius" || day.sunSign === "Pisces") out.push(`Kharmas (Sun in ${day.sunSign})`);
  const { month, extra } = lunarMonth(sky, jd);
  // Devshayani to Devuthani: Ashadha Shukla Ekadashi to Kartika Shukla Ekadashi.
  if ((month === 3 && day.tithi.index >= 11) || (month > 3 && month < 7) || (month === 7 && day.tithi.index < 11)) out.push("Chaturmas");
  if (extra) out.push("Adhika month");
  const sun = sky.sun(jd);
  if (apart(sky.jupiter(jd), sun) < 11) out.push("Jupiter combust (Guru asta)");
  if (apart(sky.venus(jd), sun) < 10) out.push("Venus combust (Shukra asta)");
  return out;
}

export function judgeDay(sky: Sky, day: PanchangDay, activity: Activity, natals: Stars[]): MuhuratDay {
  const good: string[] = [];
  const bad: string[] = [];
  const stops = activity === "marriage" || activity === "home" ? seasonStops(sky, day) : [];
  let score = 0;
  const add = (n: number, why: string) => {
    score += n;
    (n > 0 ? good : bad).push(why);
  };

  if (BAD_TITHI.has(day.tithi.index)) stops.push(`tithi ${day.tithi.name}`);
  else if (GOOD_TITHI.has(day.tithi.index)) add(1, `tithi ${day.tithi.name}`);

  if (GOOD_NAKSHATRA[activity].has(day.nakshatra.name)) add(2, `nakshatra ${day.nakshatra.name}`);
  else if (activity === "marriage" || activity === "home") stops.push(`nakshatra ${day.nakshatra.name} is not one for this`);
  else if (HARD_NAKSHATRA.has(day.nakshatra.name)) add(-2, `nakshatra ${day.nakshatra.name}`);

  if (WORST_YOGA.has(day.yoga.name)) stops.push(`yoga ${day.yoga.name}`);
  else if (HARD_YOGA.has(day.yoga.name)) add(-1, `yoga ${day.yoga.name}`);

  if ([1, 3, 4, 5].includes(day.weekday)) add(1, "a favourable weekday");
  else if ([2, 6].includes(day.weekday)) add(-1, "Tuesday or Saturday");

  for (const n of natals) {
    const tara = n.nakshatra ? taraOf(n.nakshatra, day.nakshatra.name) : null;
    if (tara && GOOD_TARA.has(tara)) add(1, `${tara} tara from ${n.who}'s ${n.nakshatra}`);
    else if (tara && BAD_TARA.has(tara)) add(-1, `${tara} tara from ${n.who}'s ${n.nakshatra}`);
    if (!n.moonSign) continue;
    const h = houseFrom(n.moonSign, day.moonSign);
    if (GOOD_CHANDRA.includes(h)) add(1, `Moon in the ${ORDINAL[h]} from ${n.who}'s`);
    else if (h === 8) add(-2, `Moon in the 8th from ${n.who}'s (Chandrashtama)`);
    else add(-1, `Moon in the ${ORDINAL[h]} from ${n.who}'s`);
  }
  return { day, score, good, bad, stops, windows: windowsOf(day) };
}

const MIN_WINDOW_MINUTES = 20;

/** The good choghadiyas, less Rahu Kaal and Bhadra, while the day's nakshatra and tithi still hold. */
export function windowsOf(day: PanchangDay): (Span & { name: string })[] {
  let end = day.nakshatra.until < day.sunset ? day.nakshatra.until : day.sunset;
  // After a fit tithi, an unfit one closes the day; another fit one does not.
  if (BAD_TITHI.has((day.tithi.index % 30) + 1) && day.tithi.until < end) end = day.tithi.until;
  let spans = day.choghadiya.filter((c) => isGoodChoghadiya(c.name));
  for (const cut of [day.rahuKaal, ...day.bhadra]) {
    spans = spans.flatMap((s) => {
      if (cut.to <= s.from || cut.from >= s.to) return [s];
      return [
        { ...s, to: cut.from },
        { ...s, from: cut.to },
      ].filter((x) => x.to > x.from);
    });
  }
  return spans
    .map((s) => ({ ...s, to: s.to < end ? s.to : end }))
    .filter((s) => s.to.diff(s.from, "minutes").minutes >= MIN_WINDOW_MINUTES);
}

const t = (d: DateTime) => d.toFormat("h:mm a");
/** "until 4:12 PM", with the date when it is not the same day's. */
const until = (d: DateTime, date: string) => (d.toISODate() === date ? `until ${t(d)}` : `until ${d.toFormat("d LLL, h:mm a")}`);
const span = (s: Span) => `${t(s.from)} to ${t(s.to)}`;

function dayLines(m: MuhuratDay): string[] {
  const d = m.day;
  const out = [
    `- ${d.date}, ${d.sunrise.toFormat("cccc")}: ${d.tithi.name} ${until(d.tithi.until, d.date)}; ${d.nakshatra.name} ${until(d.nakshatra.until, d.date)}; yoga ${d.yoga.name}. Sunrise ${t(d.sunrise)}, sunset ${t(d.sunset)}.`,
  ];
  if (m.stops.length) out.push(`  Ruled out by: ${m.stops.join("; ")}.`);
  if (m.good.length) out.push(`  For it: ${m.good.join("; ")}.`);
  if (m.bad.length) out.push(`  Against it: ${m.bad.join("; ")}.`);
  out.push(`  Good hours: ${m.windows.length ? m.windows.map((w) => `${span(w)} (${w.name})`).join(", ") : "none in daylight"}. Rahu Kaal ${span(d.rahuKaal)}.${d.bhadra.length ? ` Bhadra ${d.bhadra.map(span).join(", ")}.` : ""}`);
  return out;
}

/** The answer to "when is a good day for X", or "is this day good". */
export async function describeMuhurat(args: {
  activity: Activity;
  from: string;
  to: string;
  place: { name: string; lat: number; lng: number; timezone: string };
  natals: Stars[];
}): Promise<string> {
  const sky = await openSky();
  const start = DateTime.fromISO(args.from, { zone: "utc" });
  const days = Math.min(MAX_DAYS, Math.floor(DateTime.fromISO(args.to, { zone: "utc" }).diff(start, "days").days) + 1);
  const judged: MuhuratDay[] = [];
  for (let i = 0; i < days; i++) {
    const day = panchangDay(sky, start.plus({ days: i }).toISODate()!, args.place);
    if (day) judged.push(judgeDay(sky, day, args.activity, args.natals));
  }
  const last = start.plus({ days: days - 1 }).toISODate()!;
  const head = `MUHURAT for ${args.activity === "general" ? "general work" : args.activity}, computed for ${args.place.name} in its own local time.`;
  if (!judged.length) return `${head} The sun does not rise and set there in that stretch, so no panchang can be made.`;

  if (days <= 3) {
    const verdict = (m: MuhuratDay) => (m.stops.length ? "not a muhurat" : m.score >= GOOD_ENOUGH ? "good" : m.score >= 1 ? "fair" : "weak");
    return [head, ...judged.flatMap((m) => [`${m.day.date} overall: ${verdict(m)}.`, ...dayLines(m)]), RULES].join("\n");
  }
  const fit = judged.filter((m) => !m.stops.length && m.score >= GOOD_ENOUGH && m.windows.length);
  const best = [...fit].sort((a, b) => b.score - a.score || a.day.date.localeCompare(b.day.date)).slice(0, TOP).sort((a, b) => a.day.date.localeCompare(b.day.date));
  if (!best.length) {
    const why = new Map<string, number>();
    for (const m of judged) for (const s of m.stops) why.set(s.replace(/^(tithi|nakshatra|yoga).*/, "$1"), (why.get(s.replace(/^(tithi|nakshatra|yoga).*/, "$1")) ?? 0) + 1);
    const top = [...why].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n} days)`);
    return [head, `No day from ${args.from} to ${last} is good enough.${top.length ? ` Mostly because of: ${top.join(", ")}.` : ""}`, RULES].join("\n");
  }
  const strongest = [...best].sort((a, b) => b.score - a.score)[0];
  return [head, `From ${args.from} to ${last}, the best ${best.length} of ${fit.length} good days, in date order. Strongest: ${strongest.day.date}.`, ...best.flatMap(dayLines), RULES].join("\n");
}

const RULES =
  "Quote these dates and hours exactly, and name the place they are for. The good hours are daylight choghadiyas clear of Rahu Kaal and Bhadra. Family and regional customs differ: for a wedding or a house entry, say once that their own priest should confirm the final hour.";

/** Exported for tests. */
export const nakshatraNamesKnown = () => [...Object.values(GOOD_NAKSHATRA), HARD_NAKSHATRA].every((set) => [...set].every((n) => (NAKSHATRAS as readonly string[]).includes(n)));
