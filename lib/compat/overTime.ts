import { DateTime } from "luxon";
import { houseFrom, ORDINAL } from "@/lib/astrology/constants";
import { vimshottariTimeline } from "@/lib/astrology/dasha";
import { signsRuledBy } from "@/lib/astrology/derived";
import type { Chart } from "@/lib/astrology/types";
import { moonLongitudeFrom } from "@/lib/timeline/build";
import { naturalRelation } from "./ashtakoot";

/**
 * Compatibility over time: Guna Milan is one number for a lifetime, but two
 * people live through their own dasha periods side by side. This lines up both
 * sub-period calendars over the next few years and reads each stretch:
 *
 * - for each person, whether the running sub-period lord touches their
 *   relationships (sits in or rules their 7th house, or is Venus, the karaka)
 *   or sits in a dusthana (6th, 8th, 12th);
 * - whether the two running lords are natural friends or enemies (Parashara).
 *
 * Computed, no model. Houses count from the ascendant, or from the Moon when a
 * birth time is unknown.
 */
export type Side = { name: string; chart: Chart; birthUt: DateTime };
export type StretchTone = "warm" | "steady" | "strained";
export type Stretch = {
  start: string;
  end: string;
  you: string;
  them: string;
  tone: StretchTone;
  reasons: string[];
};

type Sub = { lord: string; start: string; end: string };

function subPeriods(side: Side): Sub[] {
  const moon = moonLongitudeFrom(side.chart);
  if (moon == null) return [];
  return vimshottariTimeline(moon, side.birthUt).flatMap((p) => p.antardashas);
}

/** +1 when the lord speaks for relationships, −1 from a dusthana, else 0; with the reason. */
export function relationshipWeight(chart: Chart, lord: string, name: string): { weight: number; reason: string | null } {
  const p = chart.planets.find((x) => x.name === lord);
  if (!p) return { weight: 0, reason: null };
  const timeKnown = chart.timeKnown !== false;
  const from = timeKnown ? chart.ascendant.sign : chart.moonSign;
  const house = houseFrom(from, p.sign);
  const ref = timeKnown ? "house" : "from the Moon";
  const seventh = signsRuledBy(lord).some((s) => houseFrom(from, s) === 7);
  if (house === 7) return { weight: 1, reason: `${name}'s ${lord} period: ${lord} sits in their 7th ${ref}, the house of partnership.` };
  if (seventh) return { weight: 1, reason: `${name}'s ${lord} period: ${lord} rules their 7th ${ref}.` };
  if (lord === "Venus") return { weight: 1, reason: `${name}'s Venus period: Venus is the significator of love.` };
  if ([6, 8, 12].includes(house)) {
    return { weight: -1, reason: `${name}'s ${lord} period: ${lord} sits in their ${ORDINAL[house]} ${ref}, a house of strain.` };
  }
  return { weight: 0, reason: null };
}

const NODES = new Set(["Rahu", "Ketu"]);

export function lordsRelation(a: string, b: string): { score: number; reason: string } {
  if (a !== b && (NODES.has(a) || NODES.has(b))) {
    const node = NODES.has(a) ? a : b;
    return { score: 0, reason: `${node} keeps no natural friendships, so the pairing is neither eased nor strained.` };
  }
  const ab = naturalRelation(a, b), ba = naturalRelation(b, a);
  if (ab === "same") return { score: 1, reason: `You are both in ${a} periods.` };
  if (ab === "enemy" || ba === "enemy") return { score: -1, reason: `${a} and ${b} are natural enemies.` };
  if (ab === "friend" && ba === "friend") return { score: 1, reason: `${a} and ${b} are natural friends.` };
  return { score: 0, reason: `${a} and ${b} are neutral to each other.` };
}

/** The birth moment in UT, which the dasha clock runs on. */
export function birthUtFrom(date: string, time: string, zone: string): DateTime {
  return DateTime.fromISO(`${date}T${String(time).slice(0, 8)}`, { zone }).toUTC();
}

export function overTime(you: Side, them: Side, today: string, years = 3): Stretch[] {
  const end = DateTime.fromISO(today).plus({ years }).toISODate()!;
  const a = subPeriods(you).filter((s) => s.end > today && s.start < end);
  const b = subPeriods(them).filter((s) => s.end > today && s.start < end);
  if (a.length === 0 || b.length === 0) return [];

  const cuts = [...new Set([today, end, ...a.map((s) => s.start), ...b.map((s) => s.start)])]
    .filter((d) => d >= today && d <= end)
    .sort();
  const at = (subs: Sub[], day: string) => subs.find((s) => s.start <= day && day < s.end);

  const stretches: Stretch[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const sa = at(a, cuts[i]), sb = at(b, cuts[i]);
    if (!sa || !sb) continue;
    const wa = relationshipWeight(you.chart, sa.lord, you.name);
    const wb = relationshipWeight(them.chart, sb.lord, them.name);
    const rel = lordsRelation(sa.lord, sb.lord);
    const score = wa.weight + wb.weight + rel.score;
    stretches.push({
      start: cuts[i],
      end: cuts[i + 1],
      you: sa.lord,
      them: sb.lord,
      tone: score >= 2 ? "warm" : score <= -1 ? "strained" : "steady",
      reasons: [rel.reason, wa.reason, wb.reason].filter((r): r is string => r !== null),
    });
  }
  // Neighbours with the same lords and tone read as one stretch.
  return stretches.reduce<Stretch[]>((out, s) => {
    const last = out[out.length - 1];
    if (last && last.you === s.you && last.them === s.them && last.tone === s.tone) last.end = s.end;
    else out.push({ ...s });
    return out;
  }, []);
}
