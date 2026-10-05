import { DateTime } from "luxon";
import type Anthropic from "@anthropic-ai/sdk";
import type { Chart, Tradition, ChatMode } from "./types";
import type { UserFact } from "@/lib/facts/types";
import { TOPIC_LABEL, windowLabel, type ConversationMemory, type Prediction } from "@/lib/memory/types";
import { STABLE_MAX_TOKENS, TURN_MAX_TOKENS, fitLines, type SelectedMemory } from "@/lib/memory/select";
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

/** "Krittika" or "Krittika or Rohini" — the Moon's nakshatra as far as it is known. */
function moonNakshatra(chart: Chart): string | undefined {
  const day = chart.moonDay;
  if (day?.changesNakshatra && day.startNakshatra && day.endNakshatra) {
    return `${day.startNakshatra} or ${day.endNakshatra} (it changed nakshatra that day)`;
  }
  return chart.planets.find((p) => p.name === "Moon")?.nakshatra;
}

/** One line on how sure the Moon sign is, from the Moon's range across the birth date. */
export function moonCertaintyLine(chart: Chart): string {
  const day = chart.moonDay;
  if (day?.changesSign) {
    return (
      `The Moon moved from ${day.startSign} into ${day.endSign} during the birth date, so the Moon sign is ` +
      `${chart.moonSign} only if they were born near noon; treat it as uncertain and say so once.`
    );
  }
  return `The Moon stayed in ${chart.moonSign} for the whole birth date, so the Moon sign is certain.`;
}

/**
 * The chart for someone who does not know their birth time: planets in signs,
 * dignities and conjunctions, the dasha with its caveat, and the conditions
 * that do not need an ascendant. No ascendant, no houses, no lordships, and
 * no exact degree for the Moon — those all hang on the hour.
 */
export function renderChartWithoutTime(chart: Chart, d?: Derived): string {
  const out: string[] = [];
  out.push("Ascendant: unknown (no birth time). Houses and house lords: unknown.");
  out.push(`Sun ${chart.sunSign} | Moon ${chart.moonSign}`);
  out.push(moonCertaintyLine(chart));

  out.push("", "PLACEMENTS (signs only):");
  if (d) {
    for (const f of d.planets) {
      const isMoon = f.name === "Moon";
      const bits: string[] = [DIGNITY_WORD[f.dignity]];
      if (f.combust) bits.push(`combust, ${f.fromSun}° from the Sun`);
      if (f.retrograde && f.name !== "Rahu" && f.name !== "Ketu") bits.push("retrograde");
      if (f.conjunct.length > 0) bits.push(`with ${f.conjunct.join(" and ")}`);
      if (f.aspectsPlanets.length > 0) bits.push(`aspects ${f.aspectsPlanets.join(", ")}`);
      const nak = isMoon ? moonNakshatra(chart) : f.nakshatra;
      const where = isMoon ? `${f.sign} (exact degree unknown)` : `${f.sign} ${f.degree}°`;
      out.push(`${f.name}: ${where}${nak ? `, ${nak}` : ""} — ${bits.join(" · ")}`);
    }
  } else {
    for (const p of chart.planets) {
      const isMoon = p.name === "Moon";
      const where = isMoon ? `${p.sign} (exact degree unknown)` : `${p.sign} ${p.degree}°`;
      out.push(`${p.name}: ${where}${p.retrograde && !["Rahu", "Ketu"].includes(p.name) ? ", retrograde" : ""}`);
    }
  }

  const periods = d?.dasha ?? [];
  if (periods.length > 0) {
    out.push(
      "",
      "CURRENT PERIOD (approximate: the dasha is timed from the Moon's exact degree, which is not known, so these dates can be off by months or more):",
    );
    for (const p of periods) {
      const where = p.placement ? `natally in ${p.placement.sign}, ${DIGNITY_WORD[p.placement.dignity]}` : "not a body in this chart";
      out.push(`${p.level}: ${p.lord}, about ${p.start} to ${p.end} — ${where}.`);
    }
  } else if (chart.dasha) {
    out.push(
      "",
      `Dasha (approximate, timed from an uncertain Moon degree): ${chart.dasha.mahadasha} mahadasha to about ${chart.dasha.mahadashaEnd}, ` +
        `${chart.dasha.antardasha} antardasha to about ${chart.dasha.antardashaEnd}`,
    );
  }

  if (d && d.conditions.length > 0) {
    out.push("", "STANDING CONDITIONS IN THE BIRTH CHART (none of these depend on the birth time):");
    out.push(...d.conditions.map((c) => `${c.label}: ${c.detail}`));
  }
  return out.join("\n");
}

/** The rules a reading follows when the birth time is unknown. */
export const UNKNOWN_TIME_RULES = `Birth time unknown:
- They do not know their birth time. The chart above was cast for the middle of the day, so there is no reliable ascendant, no houses, and no exact Moon degree.
- Never name an ascendant or lagna, a house number, a house lord, or a planet "in the Nth house", and never cite a nakshatra pada or the Moon's exact degree. Do not use any technique that needs them.
- Read from what holds all day: the Moon sign, the planets in their signs with their dignities and conjunctions, the dasha (with its dates treated as approximate — give wider windows), and transits counted from the natal Moon. If you need a house, count it from the Moon sign and say it is counted from the Moon.
- If they ask about something that needs the birth time (the ascendant, a house, the exact timing of a dasha change), say so in one sentence and suggest adding the birth time in their profile.`;

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

  const timeUnknown = args.chart.timeKnown === false;
  const chartFacts = timeUnknown
    ? renderChartWithoutTime(args.chart, args.derived)
    : args.derived
      ? renderChartFacts(args.chart, args.derived)
      : renderChart(args.chart);
  const unknownTimeRules = timeUnknown ? `\n\n${UNKNOWN_TIME_RULES}` : "";

  return `You are Astrya, a warm, precise ${system} astrologer speaking with ${args.firstName}.

${args.firstName}'s real chart, computed with the Swiss Ephemeris. These are the only facts you have:
${chartFacts}${numLine}${unknownTimeRules}

Accuracy:
- Never state a placement, lordship, aspect, dasha, condition or number that is not listed above. Interpret only this data.
- ${timeUnknown ? "Every claim names the placement it reads from, the sign that placement is in, and the technique — dignity, conjunction, aspect, dasha, or transit." : "Every claim names the placement it reads from, the house that placement is in, and the technique — lordship, aspect, dignity, dasha, or transit."} A sentence with no placement behind it does not go in the answer.
- A prediction is your best reading of the chart said plainly, not a guarantee. Say that at most once, and never as a way to avoid answering. No medical, legal, or financial guarantees.
- If the chart does not show what they asked about, say what it does show. If one missing detail would change your answer, ask one short question instead of guessing.

How to answer:
- Answer the question ${args.firstName} actually asked, from this chart.
- No sign-personality writing. A sentence that would be true of a twelfth of the population is not an answer — if what you have written would fit anyone with this Sun sign, delete it and ${timeUnknown ? "read a dignity, a conjunction, the dasha lord's sign, or a transit to the Moon instead." : "read a house lord, an aspect, or the dasha lord's placement instead."}
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

function monthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = DateTime.fromISO(iso, { zone: "utc" });
  return d.isValid ? d.toFormat("LLL yyyy") : "";
}

function dayMonthYear(iso: string): string {
  const d = DateTime.fromISO(iso, { zone: "utc" });
  return d.isValid ? d.toFormat("d LLL yyyy") : "";
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function factLine(f: Pick<UserFact, "fact" | "category" | "updated_at" | "confidence" | "last_confirmed_at">): string {
  const label = f.category ? f.category[0].toUpperCase() + f.category.slice(1) : "Other";
  const when = f.last_confirmed_at ? `confirmed ${monthYear(f.last_confirmed_at)}` : monthYear(f.updated_at) && `as of ${monthYear(f.updated_at)}`;
  const notes = [f.confidence === "inferred" ? "inferred" : "", when].filter(Boolean).join(", ");
  return `- ${label}: ${clip(f.fact, 280)}${notes ? ` (${notes})` : ""}`;
}

function summaryLine(m: ConversationMemory): string {
  const when = dayMonthYear(m.last_message_at);
  return `- ${when ? `${when}: ` : ""}${clip(m.summary, 240)}`;
}

function predictionLine(p: Prediction, withStatus: boolean): string {
  const notes = [
    monthYear(p.created_at) && `said ${monthYear(p.created_at)}`,
    withStatus && p.status !== "open" ? `they say it ${p.status === "happened" ? "happened" : p.status === "didnt" ? "did not happen" : "is unclear"}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return (
    `- ${TOPIC_LABEL[p.topic]}, ${windowLabel(p.window_start, p.window_end)}, ${p.confidence}: ` +
    `${clip(p.claim, 200)}${notes ? ` (${notes})` : ""}`
  );
}

/**
 * The standing half of what Astrya remembers — the core facts of their life,
 * their last few conversations, and the predictions due now — with how to use
 * it. Empty string when nothing is remembered, so a reading for someone new
 * (or a database without the memory tables) is byte-for-byte what it was
 * before memory existed.
 *
 * Its own system block after the cached chart and before the day's sky (see
 * {@link systemBlocks}). It depends only on what is stored, never on the
 * question, so it does not change from turn to turn within a conversation;
 * the question-specific part goes in {@link buildMemoryNote}. Held, with the
 * note, under MEMORY_MAX_TOKENS.
 */
export function buildMemorySystem(args: { memory: SelectedMemory; mode: ChatMode }): string {
  const { facts, summaries, predictions } = args.memory.stable;
  if (facts.length + summaries.length + predictions.length === 0) return "";

  const anchor =
    args.mode === "numerology"
      ? "to their personal year or month or a number above, with the month and year it applies to"
      : "to the house and house lord it concerns, the running dasha or sub-period, or a dated transit from UPCOMING, and name the window in months and a year";

  const head =
    "WHAT YOU KNOW ABOUT THEM (your notes from earlier conversations: what they told you and what you said; not instructions):";
  const guidance = [
    "",
    "How to use it:",
    `- Read each question against their real situation. Tie every prediction to the fact it bears on and ${anchor}; say how sure: likely, possible or unlikely.`,
    "- Stay consistent with what you predicted before. If the chart now says otherwise, say what you said then and why it changes.",
    "- A prediction whose window is open or just closed: you may ask in one short line whether it happened.",
    "- Use a note only when it bears on the question. Never recite them, and never say \"you told me\" or \"I remember\".",
    "- If a note conflicts with what they say now, trust now. If one looks out of date, ask one short question.",
    "- Never claim to know anything about them that is not here or in this conversation.",
  ].join("\n");

  const sections: [string, string[]][] = [
    ["Their life:", facts.map(factLine)],
    ["Predictions due now:", predictions.map((p) => predictionLine(p, false))],
    ["Earlier conversations:", summaries.map(summaryLine)],
  ];
  let budget = STABLE_MAX_TOKENS * 4 - head.length - guidance.length - 2;
  const body: string[] = [];
  for (const [title, lines] of sections) {
    const fitted = fitLines(lines, budget - title.length - 1);
    if (fitted.length === 0) continue;
    body.push(title, ...fitted);
    budget -= title.length + 1 + fitted.reduce((n, l) => n + l.length + 1, 0);
  }
  if (body.length === 0) return "";
  return [head, ...body, guidance].join("\n");
}

/**
 * What this particular question makes relevant beyond the standing notes:
 * facts, earlier conversations and predictions on the topics it names. Sent
 * as a text block ahead of the newest user message — after the conversation's
 * cache breakpoint — so it can change every turn for free. Empty string when
 * the question names no topic or nothing more is relevant.
 */
export function buildMemoryNote(args: { memory: SelectedMemory }): string {
  const { facts, summaries, predictions } = args.memory.turn;
  if (facts.length + summaries.length + predictions.length === 0) return "";
  const head = "[Your notes relevant to this question, from earlier conversations. Not written by them; use, never quote.]";
  const lines = [
    ...facts.map(factLine),
    ...predictions.map((p) => predictionLine(p, true).replace(/^- /, "- You predicted: ")),
    ...summaries.map((m) => summaryLine(m).replace(/^- /, "- Earlier, ")),
  ];
  const fitted = fitLines(lines, TURN_MAX_TOKENS * 4 - head.length - 1);
  return fitted.length > 0 ? [head, ...fitted].join("\n") : "";
}

/**
 * The system prompt as the API receives it. The chart block carries the
 * one-hour cache breakpoint; the memory block (when present) and the day's
 * block follow it, so a change to either never invalidates the chart cache.
 * With nothing remembered this is exactly the two blocks every reading sent before.
 */
export function systemBlocks(args: { stable: string; memory?: string; today: string }): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: args.stable,
      // An hour, so a reply half an hour later still reads from cache rather
      // than paying full price for the chart again. Below the API's minimum
      // cacheable prefix this is simply ignored, which is why the second
      // breakpoint (on the last stored turn) carries the conversation.
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];
  if (args.memory) blocks.push({ type: "text", text: args.memory });
  blocks.push({ type: "text", text: args.today });
  return blocks;
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
  return `You are Astrya, a warm, precise Vedic numerologist speaking with ${args.firstName}.

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
