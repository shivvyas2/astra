import { DateTime } from "luxon";
import type { Chart, Tradition } from "./types";
import { factsFor, type Derived, type Dignity, type PlanetFact } from "./derived";
import type { LoShu } from "./numerology";

const DIGNITY_WORD: Record<Dignity, string> = {
  exalted: "exalted",
  debilitated: "debilitated",
  moolatrikona: "in moolatrikona",
  own: "in its own sign",
  neutral: "neutral",
};

/** Avoids "is a enemy"/"is a friend" article agreement by phrasing the pair as the subject. */
const RELATIONSHIP_PHRASE: Record<"friend" | "neutral" | "enemy", string> = {
  friend: "are friends",
  neutral: "are neutral to each other",
  enemy: "are enemies",
};

/** "s" for a plural list of houses, "" for a single one — shared so every "rules"/"ruling" phrase agrees. */
function houseSuffix(count: number): string {
  return count > 1 ? "s" : "";
}

function planetLine(f: PlanetFact): string {
  const bits: string[] = [];
  if (f.rules.length > 0) bits.push(`rules house${houseSuffix(f.rules.length)} ${f.rules.join(", ")}`);
  bits.push(DIGNITY_WORD[f.dignity]);
  if (f.fromDeepPoint !== undefined && f.fromDeepPoint < 1) bits.push("within a degree of exact");
  if (f.combust) bits.push(`combust, ${f.fromSun}° from the Sun`);
  if (f.retrograde) bits.push("retrograde");
  if (f.aspects.length > 0) {
    bits.push(`aspects house${houseSuffix(f.aspects.length)} ${[...f.aspects].sort((a, b) => a - b).join(", ")}`);
  }
  if (f.conjunct.length > 0) bits.push(`with ${f.conjunct.join(" and ")}`);
  const nak = f.nakshatra ? `, ${f.nakshatra}` : "";
  return `${f.name}: ${f.sign} ${f.degree}°, house ${f.house}${nak} — ${bits.join(" · ")}`;
}

/**
 * The chart, with no derived facts: a plain list of planets, the ascendant,
 * and the dasha line, exactly as every reading rendered before this branch.
 *
 * This is what a Western chart gets. Every technique `renderChartFacts` below
 * adds — lordship, graha drishti, moolatrikona, combustion orbs, the natal
 * doshas — is Vedic; giving it to a Western reading would cite Indian
 * technique and Vedic doshas as though they were tropical, and would show
 * whole-sign house numbers that disagree with `chart.planets[].house`
 * (Placidus), which is what the PDF and the iOS view actually render. See
 * spec §0: "Western continues to use houseOf(lon, cusps) unchanged."
 */
function renderChart(chart: Chart): string {
  const lines: string[] = [];
  lines.push(`Ascendant: ${chart.ascendant.sign} ${chart.ascendant.degree}°`);
  lines.push(`Sun ${chart.sunSign} | Moon ${chart.moonSign}`);
  if (chart.dasha) {
    lines.push(
      `Dasha: ${chart.dasha.mahadasha} mahadasha to ${chart.dasha.mahadashaEnd}, ` +
        `${chart.dasha.antardasha} antardasha to ${chart.dasha.antardashaEnd}`,
    );
  }
  for (const p of chart.planets) {
    const nak = p.nakshatra ? `, ${p.nakshatra}` : "";
    lines.push(`${p.name}: ${p.sign} ${p.degree}°, h${p.house}${nak}${p.retrograde ? ", retrograde" : ""}`);
  }
  return lines.join("\n");
}

function renderChartFacts(chart: Chart, d: Derived): string {
  const out: string[] = [];

  out.push(`Ascendant: ${chart.ascendant.sign} ${chart.ascendant.degree}° (sets house 1)`);
  out.push(`Sun ${chart.sunSign} | Moon ${chart.moonSign}`);

  out.push("", "PLACEMENTS:");
  out.push(...d.planets.map(planetLine));

  out.push("", "HOUSES (sign, its lord, and where that lord sits):");
  for (const h of d.houses) {
    const who = h.occupants.length > 0 ? `holds ${h.occupants.join(", ")}` : "empty";
    const seen = h.aspectedBy.length > 0 ? `, aspected by ${h.aspectedBy.join(", ")}` : "";
    // lordHouse === 0 means the lord isn't one of this chart's bodies (only
    // reachable in a hand-built fixture; every real chart has all nine). Say
    // so plainly rather than stating a placement — house 0 or an empty sign
    // — that doesn't exist.
    const lordWhere =
      h.lordHouse === 0
        ? `lord ${h.lord} (not a body in this chart)`
        : `lord ${h.lord} in house ${h.lordHouse} (${h.lordSign}, ${DIGNITY_WORD[h.lordDignity]})`;
    out.push(`House ${h.number}: ${h.sign}, ${lordWhere} — ${who}${seen}`);
  }

  if (d.dasha.length > 0) {
    out.push("", "CURRENT PERIOD (the lord's own placement is what gives it its character):");
    for (const p of d.dasha) {
      const where = p.placement
        ? `natally in ${p.placement.sign} ${p.placement.degree}°, house ${p.placement.house}, ` +
          `${DIGNITY_WORD[p.placement.dignity]}` +
          (p.placement.rules.length > 0
            ? `, ruling house${houseSuffix(p.placement.rules.length)} ${p.placement.rules.join(", ")}`
            : ", ruling no house")
        : "not a body in this chart";
      out.push(`${p.level}: ${p.lord}, ${p.start} to ${p.end} — ${where}.`);
    }
  }

  if (d.conditions.length > 0) {
    out.push("", "STANDING CONDITIONS IN THE BIRTH CHART:");
    out.push(...d.conditions.map((c) => `${c.label}: ${c.detail}`));
  }

  return out.join("\n");
}

/**
 * The half of the system prompt that never changes for a user.
 *
 * Kept separate so it can carry a cache breakpoint: it is byte-identical on
 * every turn and across conversations, so after the first request it is billed
 * at a tenth of the rate. Anything that varies — the date, live transits, the
 * length rule — lives in {@link buildTodaySystem} and comes after it.
 */
export function buildChartSystem(args: {
  firstName: string;
  tradition: Tradition;
  chart: Chart;
  /** Absent for Western — see {@link renderChart}'s doc comment. */
  derived?: Derived;
  numerology?: { mulank: number; bhagyank: number };
}): string {
  const system = args.tradition === "vedic" ? "Vedic (sidereal, Lahiri)" : "Western (tropical)";
  // A blank line first: renderChartFacts's last block has no trailing blank
  // line of its own, so without this the numerology sentence would land
  // inside whichever labelled block (HOUSES, CURRENT PERIOD, STANDING
  // CONDITIONS) happens to be last — reading as one more of that block's
  // items rather than as its own fact.
  const numLine = args.numerology
    ? `\n\nNumerology: Mulank ${args.numerology.mulank}, Bhagyank ${args.numerology.bhagyank}.`
    : "";

  const chartFacts = args.derived ? renderChartFacts(args.chart, args.derived) : renderChart(args.chart);

  return `You are Sanchara, a warm, precise ${system} astrologer speaking with ${args.firstName}.

${args.firstName}'s real chart, computed with the Swiss Ephemeris. These are the only facts you have:
${chartFacts}${numLine}

Accuracy:
- Never state a placement, lordship, aspect, dasha, condition or number that is not listed above. Interpret only this data.
- Every claim names the placement it reads from, the house that placement is in, and the technique — lordship, aspect, dignity, dasha, or transit. A sentence with no placement behind it does not go in the answer.
- A prediction is your best reading of the chart said plainly, not a guarantee. Say that at most once, and never as a way to avoid answering. No medical, legal, or financial guarantees.
- If the chart does not show what they asked about, say what it does show. If one missing detail would change your answer, ask one short question instead of guessing.

How to answer:
- Answer the question ${args.firstName} actually asked, from this chart.
- No sign-personality writing. A sentence that would be true of a twelfth of the population is not an answer — if what you have written would fit anyone with this Sun sign, delete it and read a house lord, an aspect, or the dasha lord's placement instead.
- Name the placement you are reading from, then say what it means in plain terms. Do not list the chart back at them.
- In a conversation, build on what you already said instead of repeating it.
- For anything about work, money, love, health, or family, say what the chart indicates and what it asks of them.

Be specific and personal:
- Speak to ${args.firstName} about their life, not about "a person with this chart". Use what they have told you (the LIFE TIMELINE and earlier turns) and refer back to it by name: the job, the city, the relationship, the year.
- Commit. Every prediction states three things: what (a concrete event or decision — a job offer, a move, a payment that lands late, a conversation about marriage — not "changes" or "energy"), when (a dated window taken from the dasha dates, today's sky, or UPCOMING below, written as months and years), and how sure you are, using exactly one of: likely, possible, unlikely.
- Pick the outcome the chart favours and say it. Never write both outcomes to be safe; never "may or may not"; never a list of things that "could" happen. If something would change your reading, say it in one clause at most.
- A yes/no question gets a yes, a no, or a "most likely yes/no" in the first sentence, then the placement that says so.
- Numbers are welcome when the chart gives them: the month a sub-period ends, the house a transit enters, how many years remain.

Format:
- Two or three short sections. Each is a bold markdown heading (for example **Career**) followed by one or two sentences, or a few "- " bullets.
- Plain text only: no emoji, no decorative symbols, no dashes as separators, no bold inside sentences.
- End with a section titled **In simple words** — one or two everyday sentences, no jargon, answering ${args.firstName} directly.
- This is guidance and reflection, not a substitute for professional advice. Say so only when it fits naturally.

Never invent, and never flatter. If the honest reading is unremarkable, say so plainly.`;
}

/**
 * The half that changes: the date, the live sky, and how long to answer.
 *
 * `today` is deliberately coarse (date plus part of day) and transits are
 * computed for the day, not the minute, so this text is stable for hours —
 * which is what lets the block above stay a cache hit.
 */
export function buildTodaySystem(args: {
  today: string;
  /** Whole years lived as of `today`; see {@link ageOn}. */
  age?: number;
  transits?: string;
  /**
   * Dated changes ahead — sign ingresses, stations, the next sub-periods —
   * from {@link describeUpcomingTransits} and {@link describeUpcomingPeriods}.
   * Phrased relative to today ("about 14 months from now"), which is why it
   * lives in this half even though a dasha boundary moves only once a year.
   */
  upcoming?: string;
  maxWords?: number;
  personal?: { year: number; month: number };
}): string {
  const lines = [`Today is ${args.today}. Use it for anything about "today", "now", or the current period.`];
  if (args.age !== undefined) lines.push(`They are ${args.age} years old.`);
  if (args.personal) {
    lines.push(
      `They are in personal year ${args.personal.year} and personal month ${args.personal.month}. ` +
        `Use these for anything about this year or this month.`,
    );
  }
  if (args.transits) {
    lines.push(
      "",
      "SKY TODAY:",
      args.transits,
      "",
      "For anything about now, name the transiting planet and the natal house or planet it touches.",
    );
  }
  if (args.upcoming) {
    lines.push(
      "",
      "UPCOMING (dated, from the ephemeris and the dasha table):",
      args.upcoming,
      "",
      "When you predict, take the window from here and name its dates.",
    );
  }
  lines.push(`Length: ${args.maxWords ?? 160} words or fewer unless they ask for more.`);
  return lines.join("\n");
}

/**
 * Whole years lived on `now`'s calendar date, or undefined when the birth
 * date does not parse. The birthday is read in `now`'s zone so someone born
 * on the 2nd turns a year older on the 2nd where they live, not at UTC.
 */
export function ageOn(birthDate: string, now: DateTime): number | undefined {
  const birth = DateTime.fromISO(birthDate, { zone: now.zone });
  if (!birth.isValid || !now.isValid) return undefined;
  const years = Math.floor(now.diff(birth, "years").years);
  return years >= 0 ? years : undefined;
}

/** The whole system prompt as one string, for callers that do not cache. */
export function buildSystemPrompt(args: {
  firstName: string;
  tradition: Tradition;
  chart: Chart;
  derived?: Derived;
  today?: string;
  age?: number;
  numerology?: { mulank: number; bhagyank: number };
  transits?: string;
  upcoming?: string;
  maxWords?: number;
}): string {
  const chartPart = buildChartSystem({ ...args, derived: args.derived ?? factsFor(args.chart) });
  if (!args.today && !args.transits) return chartPart;
  return `${chartPart}\n\n${buildTodaySystem({
    today: args.today ?? "",
    age: args.age,
    transits: args.transits,
    upcoming: args.upcoming,
    maxWords: args.maxWords,
  })}`;
}

/** Numerology mode: the stable half. */
export function buildNumerologySystem(args: {
  firstName: string;
  fullName: string;
  mulank: number;
  bhagyank: number;
  namank: number;
  grid: LoShu;
  namankToMulank: "friend" | "neutral" | "enemy";
}): string {
  return `You are Sanchara, a warm, precise Vedic numerologist speaking with ${args.firstName}.

${args.firstName}'s real numbers, computed from their birth date and name. These are the only facts you have:
- Mulank (root, from the birth day): ${args.mulank}
- Bhagyank (destiny, from the full birth date): ${args.bhagyank}
- Namank (name number, from "${args.fullName}"): ${args.namank}
- Repeated digits in the birth date: ${args.grid.repeated.join(", ") || "none"}.
- Missing digits: ${args.grid.missing.join(", ") || "none"}.
- The namank ${args.namank} and the mulank ${args.mulank} ${RELATIONSHIP_PHRASE[args.namankToMulank]}.

Accuracy:
- Every number you cite must match the values above exactly. Never invent or alter one.
- Describe tendencies and guidance, never guaranteed outcomes. No medical, legal, or financial guarantees.
- If one missing detail would change your answer, ask one short question instead of guessing.

Format:
- Two or three short sections. Each is a bold markdown heading (for example **Your Mulank ${args.mulank}**) followed by one or two sentences, or a few "- " bullets.
- Plain text only: no emoji, no decorative symbols, no dashes as separators.
- End with a section titled **In simple words** — one or two everyday sentences, no jargon, answering ${args.firstName} directly.
- This is guidance and reflection, not a substitute for professional advice. Say so only when it fits naturally.`;
}

export function buildNumerologyPrompt(args: {
  firstName: string;
  fullName: string;
  mulank: number;
  bhagyank: number;
  namank: number;
  grid: LoShu;
  namankToMulank: "friend" | "neutral" | "enemy";
  today?: string;
  maxWords?: number;
}): string {
  const stable = buildNumerologySystem(args);
  if (!args.today) return stable;
  return `${stable}\n\n${buildTodaySystem({ today: args.today, maxWords: args.maxWords })}`;
}
