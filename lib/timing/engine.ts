import { DateTime } from "luxon";
import { houseFrom, ORDINAL } from "@/lib/astrology/constants";
import type { Chart } from "@/lib/astrology/types";
import { TOPIC_HOUSES } from "@/lib/memory/topics";
import { TOPICS, TOPIC_LABEL, type Topic } from "@/lib/memory/types";
import type { TimelinePeriod } from "@/lib/timeline/build";
import type { SkyEvent } from "./sky";

/**
 * The timing engine: the sky's calendar (lib/timing/sky.ts) and the person's
 * own dasha calendar, read against their chart into dated windows — what
 * starts, on which day, in which house, about which part of life, and whether
 * classical gochara counts it as easy or hard.
 *
 * Everything here is computed, not written by a model. Readings quote these
 * dates (describeTiming), the app lists them, and they export to a calendar.
 * Vedic only: the houses are whole-sign from the ascendant and the Moon.
 */
export type Tone = "supportive" | "challenging" | "mixed";

export type TimingEvent = {
  id: string;
  /** The day it starts, yyyy-mm-dd. */
  date: string;
  /** The day the window closes, when that falls inside the horizon. */
  end: string | null;
  kind: "ingress" | "station" | "dasha";
  body: string;
  title: string;
  detail: string;
  /** Whole-sign house from the ascendant; null when the birth time is unknown. */
  houseFromAsc: number | null;
  houseFromMoon: number | null;
  topics: Topic[];
  tone: Tone;
};

/** Houses from the Moon where classical gochara reads each body as helpful. */
const FAVOURABLE: Record<string, number[]> = {
  Saturn: [3, 6, 11],
  Jupiter: [2, 5, 7, 9, 11],
  Rahu: [3, 6, 11],
  Ketu: [3, 6, 11],
  Mars: [3, 6, 11],
};
/** Houses from the Moon read as hard for the malefics: Sade Sati, kantaka, ashtama. */
const DIFFICULT: Record<string, number[]> = {
  Saturn: [12, 1, 2, 4, 8],
  Rahu: [1, 8, 12],
  Ketu: [1, 8, 12],
  Mars: [1, 8, 12],
  Jupiter: [8, 12],
};

function toneFor(body: string, fromMoon: number | null): Tone {
  if (fromMoon == null) return "mixed";
  if (FAVOURABLE[body]?.includes(fromMoon)) return "supportive";
  if (DIFFICULT[body]?.includes(fromMoon)) return "challenging";
  return "mixed";
}

/** The parts of life a house stands for, in the fixed topic order. */
export function topicsForHouse(house: number | null): Topic[] {
  if (house == null) return [];
  return TOPICS.filter((t) => t !== "general" && TOPIC_HOUSES[t].includes(house));
}

const SADE_SATI: Record<number, string> = {
  12: "Sade Sati begins: Saturn enters the 12th from your Moon for about two and a half years.",
  1: "Sade Sati reaches its middle phase, Saturn over your Moon sign.",
  2: "Sade Sati enters its last phase, Saturn in the 2nd from your Moon.",
  3: "Sade Sati ends as Saturn moves on to the 3rd from your Moon.",
};

function longDate(iso: string): string {
  return DateTime.fromISO(iso).toFormat("d LLL yyyy");
}

export function personalTiming(args: {
  natal: Chart;
  sky: SkyEvent[];
  /** Dasha periods from the timeline; antardasha changes inside the horizon become events. */
  periods?: TimelinePeriod[];
  today: string;
  horizonEnd: string;
}): TimingEvent[] {
  const { natal, sky, today, horizonEnd } = args;
  const timeKnown = natal.timeKnown !== false;
  const lagna = natal.ascendant.sign;
  const events: TimingEvent[] = [];

  for (const e of sky) {
    if (e.date <= today || e.date > horizonEnd) continue;
    // Rahu and Ketu move as a pair; Ketu is always opposite, so it is said once, with Rahu.
    if (e.body === "Ketu" && e.kind === "ingress") continue;
    const fromAsc = timeKnown ? houseFrom(lagna, e.sign) : null;
    const fromMoon = houseFrom(natal.moonSign, e.sign);
    const house = fromAsc ?? fromMoon;
    const where = fromAsc != null ? `your ${ORDINAL[fromAsc]} house` : `the ${ORDINAL[fromMoon]} from your Moon`;

    if (e.kind === "ingress") {
      const next = sky.find((x) => x.kind === "ingress" && x.body === e.body && x.date > e.date);
      const over = natal.planets.filter((p) => p.sign === e.sign && p.name !== e.body).map((p) => p.name);
      const node = e.body === "Rahu";
      const parts = [`${e.body} moves from ${e.from} into ${e.sign}${e.retrograde && !node ? ", retrograde" : ""}.`];
      // "1st from your Moon" is said better by "over your natal Moon" below.
      if (fromAsc != null && fromMoon !== 1) parts.push(`${ORDINAL[fromMoon]} from your Moon.`);
      if (over.length) parts.push(`It passes over your natal ${over.join(" and ")}.`);
      if (e.body === "Rahu") {
        const ketu = sky.find((x) => x.kind === "ingress" && x.body === "Ketu" && x.date === e.date);
        if (ketu && ketu.kind === "ingress") parts.push(`Ketu moves into ${ketu.sign} the same day.`);
      }
      if (e.body === "Saturn" && SADE_SATI[fromMoon]) parts.push(SADE_SATI[fromMoon]);
      if (next) parts.push(`Until ${longDate(next.date)}.`);
      events.push({
        id: `${e.date}-${e.body}-ingress`,
        date: e.date,
        end: next?.date ?? null,
        kind: "ingress",
        body: e.body,
        title: `${e.body}${e.body === "Rahu" ? " and Ketu" : ""} into ${e.sign}: ${where}`,
        detail: parts.filter(Boolean).join(" "),
        houseFromAsc: fromAsc,
        houseFromMoon: fromMoon,
        topics: topicsForHouse(house),
        tone: toneFor(e.body, fromMoon),
      });
    } else {
      events.push({
        id: `${e.date}-${e.body}-station`,
        date: e.date,
        end: null,
        kind: "station",
        body: e.body,
        title: `${e.body} turns ${e.retrograde ? "retrograde" : "direct"} in ${where}`,
        detail: e.retrograde
          ? `${e.body} slows and turns back in ${e.sign}: what it began in ${where} gets revisited.`
          : `${e.body} turns forward again in ${e.sign}: matters of ${where} start moving.`,
        houseFromAsc: fromAsc,
        houseFromMoon: fromMoon,
        topics: topicsForHouse(house),
        tone: "mixed",
      });
    }
  }

  for (const period of args.periods ?? []) {
    for (const sub of period.antardashas) {
      if (sub.start <= today || sub.start > horizonEnd) continue;
      const lord = natal.planets.find((p) => p.name === sub.lord);
      const house = lord ? (timeKnown ? lord.house : houseFrom(natal.moonSign, lord.sign)) : null;
      const where = lord ? (timeKnown ? `natally in your ${ORDINAL[lord.house]} house` : `natally in ${lord.sign}`) : "";
      events.push({
        id: `${sub.start}-${sub.lord}-dasha`,
        date: sub.start,
        end: sub.end,
        kind: "dasha",
        body: sub.lord,
        title: `${sub.lord} sub-period begins (${period.lord} major period)`,
        detail: `Your ${period.lord}–${sub.lord} period runs ${longDate(sub.start)} to ${longDate(sub.end)}.${where ? ` ${sub.lord} is ${where}.` : ""}`,
        houseFromAsc: timeKnown ? lord?.house ?? null : null,
        houseFromMoon: lord ? houseFrom(natal.moonSign, lord.sign) : null,
        topics: topicsForHouse(house),
        tone: "mixed",
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** The engine's dates as prompt lines, so a reading names exact days rather than months. */
export function describeTiming(events: TimingEvent[], limit = 14): string {
  return events
    .slice(0, limit)
    .map((e) => {
      const topics = e.topics.length ? ` [${e.topics.map((t) => TOPIC_LABEL[t].toLowerCase()).join(", ")}]` : "";
      return `- ${e.date}: ${e.title}${e.end ? `, until ${e.end}` : ""} (${e.tone})${topics}.`;
    })
    .join("\n");
}
