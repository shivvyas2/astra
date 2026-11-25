import { getSwe } from "./chart";
import { houseFrom, SIGNS, signOf } from "./constants";
import type { Chart } from "./types";

/**
 * Saturn's stays in each sidereal sign from 1900 to 2100, to the day, and the
 * Sade Sati and Dhaiya they make for a Moon sign. The same for everyone, so
 * the sky is scanned once per process.
 */
export type Stay = { sign: string; from: string; to: string };

const DAY_MS = 86_400_000;
const STEP = 10;
const iso = (dayNumber: number) => new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
const dayNumber = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);

let stays: Promise<Stay[]> | null = null;
export function saturnStays(): Promise<Stay[]> {
  stays ??= scan().catch((err) => {
    stays = null;
    throw err;
  });
  return stays;
}

async function scan(): Promise<Stay[]> {
  const swe = await getSwe();
  swe.set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
  // Noon UTC of a day, as in lib/timing/sky.ts, so the two never disagree.
  const signOn = (day: number) => signOf(swe.calc_ut(2440587.5 + day + 0.5, swe.SE_SATURN, swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL)[0] as number);
  const start = dayNumber("1900-01-01");
  const end = dayNumber("2100-01-01");
  const out: Stay[] = [];
  let sign = signOn(start);
  let from = start;
  for (let day = start; day < end; day += STEP) {
    const next = signOn(day + STEP);
    if (next === sign) continue;
    // Saturn cannot cross and come back inside ten days, so one change per step.
    let lo = day;
    let hi = day + STEP;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (signOn(mid) === sign) lo = mid;
      else hi = mid;
    }
    out.push({ sign, from: iso(from), to: iso(hi) });
    sign = next;
    from = hi;
  }
  out.push({ sign, from: iso(from), to: iso(end) });
  return out;
}

export type Phase = { phase: "rising" | "peak" | "setting"; from: string; to: string };
export type SadeSati = { from: string; to: string; phases: Phase[] };

const PHASE: Record<number, Phase["phase"]> = { 12: "rising", 1: "peak", 2: "setting" };
/** Retrograde dips in and out of a sign belong to the same Sade Sati; the next one is over twenty years on. */
const SAME_CYCLE_DAYS = 3 * 365;

export async function sadeSatiFor(moonSign: string, birthDate: string): Promise<SadeSati[]> {
  const cycles: SadeSati[] = [];
  for (const s of await saturnStays()) {
    const phase = PHASE[houseFrom(moonSign, s.sign)];
    if (!phase || s.to <= birthDate) continue;
    const last = cycles.at(-1);
    if (last && dayNumber(s.from) - dayNumber(last.to) < SAME_CYCLE_DAYS) {
      last.phases.push({ phase, from: s.from, to: s.to });
      last.to = s.to;
    } else {
      cycles.push({ from: s.from, to: s.to, phases: [{ phase, from: s.from, to: s.to }] });
    }
  }
  return cycles;
}

export async function dhaiyaFor(moonSign: string, birthDate: string): Promise<Stay[]> {
  return (await saturnStays()).filter((s) => [4, 8].includes(houseFrom(moonSign, s.sign)) && s.to > birthDate);
}

const LIFE_YEARS = 90;

/** The Sade Sati table as a reading is given it. */
export async function describeSadeSati(args: { moonSign: string; birthDate: string; today: string; moonCertain: boolean }): Promise<string> {
  const { moonSign, birthDate, today } = args;
  if (!(SIGNS as readonly string[]).includes(moonSign)) return "The Moon sign is not known, so Sade Sati cannot be dated.";
  const until = `${Number(birthDate.slice(0, 4)) + LIFE_YEARS}${birthDate.slice(4)}`;
  const cycles = (await sadeSatiFor(moonSign, birthDate)).filter((c) => c.from < until);
  const lines = [`SADE SATI (Saturn through the 12th, 1st and 2nd signs from the Moon in ${moonSign}), dated to the day. A phase listed twice is Saturn turning retrograde out of a sign and coming back:`];
  if (!args.moonCertain) lines.push("The Moon changed sign on the birth date and the birth time is unknown, so these dates may belong to the neighbouring sign. Say so.");
  for (const c of cycles) {
    const now = c.from <= today && today < c.to;
    lines.push(`- ${c.from} to ${c.to}${now ? " (running now)" : c.to <= today ? " (over)" : ""}: ${c.phases.map((p) => `${p.phase} ${p.from} to ${p.to}${p.from <= today && today < p.to ? " (now)" : ""}`).join("; ")}`);
  }
  if (!cycles.some((c) => c.from <= today && today < c.to)) lines.push("It is not running today.");
  const dhaiya = (await dhaiyaFor(moonSign, birthDate)).filter((s) => s.to > today).slice(0, 4);
  lines.push("DHAIYA (Saturn in the 4th or 8th from the Moon), now and next:");
  for (const s of dhaiya) lines.push(`- ${s.from} to ${s.to}: the ${houseFrom(moonSign, s.sign)}th, ${s.sign}${s.from <= today ? " (running now)" : ""}`);
  return lines.join("\n");
}

/** Whether the Moon sign is one to date things from. */
export const moonIsCertain = (chart: Chart) => !(chart.timeKnown === false && chart.moonDay?.changesSign);
