import { houseFrom } from "@/lib/astrology/constants";
import { GRAHA_SANSKRIT, RASHI_SANSKRIT } from "@/lib/profiles/names";
import type { Compatibility, KootaForClient } from "@/lib/compat/compatibility";
import type { DoshaException, DoshaNote, MangalResult } from "@/lib/compat/ashtakoot";
import type { ElementPair, SynastryAspect } from "@/lib/compat/synastry";
import type { Stretch, StretchReason } from "@/lib/compat/overTime";
import type { TimingEvent } from "@/lib/timing/engine";
import type { Factor } from "@/lib/timing/compare";
import type { Pattern } from "@/lib/mood/patterns";
import type { Topic } from "@/lib/memory/types";
import type { I18n } from "./core";

/**
 * The computed astrology on the site, in the reader's language. The engines
 * (lib/timing, lib/compat, lib/mood) write English, which the readings quote
 * and the iPhone shows; each also returns the facts it wrote from, and these
 * say the same thing again in Hindi or Gujarati. In English the engine's own
 * sentence is shown, so nothing English changes.
 *
 * Client-safe: used by both server pages and client components.
 */

function lookup<T extends Record<string, string>>(table: T, key: string): string {
  return (table as Record<string, string>)[key] ?? key;
}

export const planet = (i: I18n, name: string) => lookup(i.t.names.planets, name);
export const sign = (i: I18n, name: string) => lookup(i.t.names.signs, name);
export const nakshatra = (i: I18n, name: string) => lookup(i.t.names.nakshatras, name);
export const category = (i: I18n, name: string) => lookup(i.t.names.categories, name);
export const taraName = (i: I18n, name: string) => lookup(i.t.names.taras, name);
export const topicLabel = (i: I18n, topic: Topic) => i.t.topics[topic];
export function ordinal(i: I18n, n: number): string {
  return (i.t.names.ordinals as unknown as Record<number, string>)[n] ?? String(n);
}

/** A sign as the Vedic pages show it: Sanskrit in English ("Vrishabha"), the native name otherwise. */
export const vedicSign = (i: I18n, name: string) => (i.locale === "en" ? RASHI_SANSKRIT[name] ?? name : sign(i, name));
export const vedicPlanet = (i: I18n, name: string) => (i.locale === "en" ? GRAHA_SANSKRIT[name] ?? name : planet(i, name));

/** "12 Mar 2027", as the engine writes it. */
export function shortDate(i: I18n, iso: string): string {
  return i.date(`${iso.slice(0, 10)}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }, "en-GB");
}

// --- Key dates -------------------------------------------------------------------

export function timingText(i: I18n, e: TimingEvent): { title: string; detail: string } {
  const facts = e.facts;
  if (i.locale === "en" || !facts) return { title: e.title, detail: e.detail };
  const { t, f } = i;
  const where =
    e.houseFromAsc != null
      ? f(t.timing.whereHouse, { ord: ordinal(i, e.houseFromAsc) })
      : f(t.timing.whereMoon, { ord: ordinal(i, e.houseFromMoon ?? 0) });
  const body = planet(i, e.body);

  if (facts.kind === "ingress") {
    const title =
      e.body === "Rahu"
        ? f(t.timing.ingressTitleNodes, { sign: sign(i, facts.sign), where })
        : f(t.timing.ingressTitle, { body, sign: sign(i, facts.sign), where });
    const parts = [f(facts.retrograde ? t.timing.movesRetro : t.timing.moves, { body, from: sign(i, facts.from), sign: sign(i, facts.sign) })];
    if (e.houseFromAsc != null && e.houseFromMoon != null && e.houseFromMoon !== 1) {
      parts.push(f(t.timing.fromMoon, { ord: ordinal(i, e.houseFromMoon) }));
    }
    if (facts.over.length) parts.push(f(t.timing.passesOver, { planets: i.list(facts.over.map((p) => planet(i, p))) }));
    if (facts.ketuSign) parts.push(f(t.timing.ketuSameDay, { sign: sign(i, facts.ketuSign) }));
    if (facts.sadeSati) {
      const phase = { 12: "begins", 1: "middle", 2: "last", 3: "ends" } as const;
      parts.push(t.timing.sadeSati[phase[facts.sadeSati]]);
    }
    if (e.end) parts.push(f(t.timing.until, { date: shortDate(i, e.end) }));
    return { title, detail: parts.join(" ") };
  }

  if (facts.kind === "station") {
    return {
      title: f(facts.retrograde ? t.timing.retroTitle : t.timing.directTitle, { body, where }),
      detail: f(facts.retrograde ? t.timing.retroDetail : t.timing.directDetail, { body, sign: sign(i, facts.sign), where }),
    };
  }

  const lord = planet(i, e.body);
  const major = planet(i, facts.major);
  const parts = [f(t.timing.dashaDetail, { major, lord, start: shortDate(i, facts.start), end: shortDate(i, facts.end) })];
  if (facts.lordHouse != null) parts.push(f(t.timing.dashaInHouse, { lord, ord: ordinal(i, facts.lordHouse) }));
  else if (facts.lordSign) parts.push(f(t.timing.dashaInSign, { lord, sign: sign(i, facts.lordSign) }));
  return { title: f(t.timing.dashaTitle, { lord, major }), detail: parts.join(" ") };
}

// --- Compare two dates ------------------------------------------------------------

export function factorText(i: I18n, factor: Factor): { label: string; detail: string } {
  const facts = factor.facts;
  if (i.locale === "en" || !facts) return { label: factor.label, detail: factor.detail };
  const { t, f } = i;
  switch (facts.kind) {
    case "chandra":
      return {
        label: t.compare.chandraLabel,
        detail: f(facts.good ? t.compare.chandraGood : t.compare.chandraBad, { sign: sign(i, facts.sign), ord: ordinal(i, facts.house) }),
      };
    case "tara":
      return {
        label: t.compare.taraLabel,
        detail: f(t.compare.taraDetail, {
          nakshatra: nakshatra(i, facts.nakshatra),
          tara: taraName(i, facts.tara),
          natal: nakshatra(i, facts.natal),
        }),
      };
    case "gochara":
      return {
        label: f(t.compare.gocharaLabel, { body: planet(i, facts.body) }),
        detail: f(t.compare.gocharaDetail, { body: planet(i, facts.body), sign: sign(i, facts.sign), ord: ordinal(i, facts.house) }),
      };
    case "topic":
      return {
        label: f(t.compare.topicLabel, { topic: topicLabel(i, facts.topic) }),
        detail: f(t.compare.topicDetail, { body: planet(i, facts.body), ord: ordinal(i, facts.house), topic: topicLabel(i, facts.topic) }),
      };
  }
}

// --- Mood --------------------------------------------------------------------------

export function moodPatternText(i: I18n, p: Pattern): { label: string; sentence: string } {
  if (i.locale === "en") return { label: p.label, sentence: p.sentence };
  const { t, f } = i;
  const favourable = p.key === "chandra" ? t.mood.chandraFavourable : t.mood.taraFavourable;
  return {
    label: p.key === "chandra" ? t.mood.chandraLabel : t.mood.taraLabel,
    sentence: f(p.gap > 0 ? t.mood.better : t.mood.worse, {
      favourable,
      gap: Math.abs(p.gap).toFixed(1),
      good: p.good.days,
      other: p.other.days,
    }),
  };
}

// --- Compatibility -------------------------------------------------------------------

/** "1", "1.5", "27.5": gunas come in halves. */
export function gunas(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function verdictText(i: I18n, total: number, english: string): string {
  if (i.locale === "en") return english;
  const v = i.t.compat.verdict;
  if (total < 18) return v.below;
  if (total <= 24) return v.acceptable;
  if (total <= 32) return v.veryGood;
  return v.excellent;
}

export const kootaName = (i: I18n, k: KootaForClient) => (i.locale === "en" ? k.name : i.t.compat.kootas[k.key]);

/** A koota's category for one person. Graha Maitri and Bhakoot carry graha and rashi names. */
export function kootaCategory(i: I18n, k: KootaForClient, value: string): string {
  if (k.key === "maitri") return vedicPlanet(i, value);
  if (k.key === "bhakoot") return vedicSign(i, value);
  if (i.locale === "en") return value;
  if (k.key === "tara") return taraName(i, value);
  return category(i, value);
}

function pairName(i: I18n, kootas: KootaForClient[]): string {
  const b = kootas.find((k) => k.key === "bhakoot");
  if (!b) return "";
  const n = Math.min(houseFrom(b.you, b.them), houseFrom(b.them, b.you));
  return n === 1 ? i.t.compat.notes.sameSign : `${n}/${14 - n}`;
}

export function kootaNote(i: I18n, k: KootaForClient, kootas: KootaForClient[]): string {
  if (i.locale === "en") return k.note;
  const { f } = i;
  const n = i.t.compat.notes;
  switch (k.key) {
    case "varna":
      return k.score ? n.varnaGood : n.varnaLow;
    case "vashya":
      return k.score === 2 ? n.vashyaSame : k.score === 0 ? n.vashyaNone : n.vashyaPartial;
    case "tara":
      return k.score === 3 ? n.taraKind : k.score === 0 ? n.taraHard : n.taraOne;
    case "yoni":
      return k.score === 4 ? n.yoniSame : k.score === 0 ? n.yoniEnemy : k.score >= 3 ? n.yoniFriendly : n.yoniNeutral;
    case "maitri": {
      const a = planet(i, k.you), b = planet(i, k.them);
      if (k.you === k.them) return f(n.maitriSame, { lord: a });
      return f(k.score >= 4 ? n.maitriFriendly : k.score >= 3 ? n.maitriNeutral : n.maitriUneasy, { a, b });
    }
    case "gana":
      return k.score === 6 ? n.ganaMatch : k.score === 0 ? n.ganaClash : n.ganaWorkable;
    case "bhakoot": {
      if (k.score === 0) return f(n.bhakootDosha, { pair: pairName(i, kootas) });
      return k.you === k.them ? n.bhakootSame : f(n.bhakootApart, { pair: pairName(i, kootas) });
    }
    case "nadi":
      return k.score === 0 ? f(n.nadiDosha, { nadi: category(i, k.you) }) : n.nadiDiffer;
  }
}

function exceptionText(i: I18n, e: DoshaException): string {
  const d = i.t.compat.dosha;
  switch (e.code) {
    case "sameLord":
      return i.f(d.sameLord, { lord: planet(i, e.lord) });
    case "friendLords":
      return i.f(d.friendLords, { a: planet(i, e.a), b: planet(i, e.b) });
    default:
      return d[e.code];
  }
}

function mangalNoteText(i: I18n, m: { a: MangalResult; b: MangalResult }, them: string): string {
  const { f } = i;
  const d = i.t.compat.dosha;
  const names = { a: d.you, b: them };
  const describe = (r: MangalResult) => {
    const where = [r.fromLagna ? d.fromAsc : "", r.fromMoon ? d.fromMoon : ""].filter(Boolean);
    return where.length ? f(d.mangalFrom, { where: i.list(where) }) : d.mangalNone;
  };
  const unchecked = [m.a.fromLagna === null ? names.a : "", m.b.fromLagna === null ? names.b : ""].filter(Boolean);
  const caveat = unchecked.length ? ` ${f(d.mangalCaveat, { names: i.list(unchecked) })}` : "";
  if (m.a.present && m.b.present) return f(d.mangalBoth, { a: names.a, da: describe(m.a), b: names.b, db: describe(m.b) }) + caveat;
  if (m.a.present || m.b.present) {
    return (
      f(d.mangalOne, {
        who: m.a.present ? names.a : names.b,
        desc: describe(m.a.present ? m.a : m.b),
        other: m.a.present ? names.b : names.a,
      }) + caveat
    );
  }
  return d.mangalNeither + caveat;
}

/** A dosha's heading, note and classical exceptions. */
export function doshaText(
  i: I18n,
  d: DoshaNote,
  kootas: KootaForClient[],
  them: string,
): { title: string; note: string; exceptions: string[] } {
  const name = i.t.compat.doshaNames[d.kind];
  const title = d.present ? name : i.f(i.t.compat.doshaNone, { name });
  if (i.locale === "en") return { title, note: d.note, exceptions: d.exceptions };
  const dd = i.t.compat.dosha;
  const exceptions = d.exceptionCodes ? d.exceptionCodes.map((e) => exceptionText(i, e)) : d.exceptions;
  const lifted = exceptions.length > 0 ? ` ${dd.lifted}` : "";
  let note = d.note;
  if (d.kind === "nadi") note = dd.nadi + lifted;
  else if (d.kind === "bhakoot") note = i.f(dd.bhakoot, { pair: pairName(i, kootas) }) + lifted;
  else if (d.mangal) note = mangalNoteText(i, d.mangal, them);
  return { title, note, exceptions };
}

export function aspectLine(i: I18n, a: SynastryAspect): string {
  if (i.locale === "en") return `Your ${a.a} ${a.aspect} their ${a.b}`;
  const c = i.t.compat;
  return i.f(c.aspectLine, { a: planet(i, a.a), aspect: c.aspects[a.aspect], b: planet(i, a.b) });
}

export const toneText = (i: I18n, tone: SynastryAspect["tone"]) => i.t.compat.tones[tone];

export function elementLine(i: I18n, p: ElementPair): string {
  const [a, b] = p.label.split(" and ");
  const c = i.t.compat;
  if (i.locale === "en") return `Your ${a} (${p.a}) and their ${b} (${p.b}): ${p.relation}`;
  return i.f(c.elementLine, {
    a: planet(i, a),
    ea: c.elements[p.a],
    b: planet(i, b),
    eb: c.elements[p.b],
    relation: c.relations[p.relation],
  });
}

function reasonText(i: I18n, r: StretchReason): string {
  const { f } = i;
  const c = i.t.compat.reasons;
  switch (r.code) {
    case "seventh":
      return f(r.timeKnown ? c.seventhHouse : c.seventhMoon, { name: r.name, lord: planet(i, r.lord) });
    case "rules":
      return f(r.timeKnown ? c.rulesHouse : c.rulesMoon, { name: r.name, lord: planet(i, r.lord) });
    case "dusthana":
      return f(r.timeKnown ? c.dusthanaHouse : c.dusthanaMoon, { name: r.name, lord: planet(i, r.lord), ord: ordinal(i, r.house) });
    case "venus":
      return f(c.venus, { name: r.name });
    case "node":
      return f(c.node, { node: planet(i, r.node) });
    case "same":
      return f(c.same, { lord: planet(i, r.lord) });
    default:
      return f(c[r.code], { a: planet(i, r.a), b: planet(i, r.b) });
  }
}

export function stretchReasons(i: I18n, s: Stretch): string[] {
  if (i.locale === "en" || !s.why) return s.reasons;
  return s.why.map((r) => reasonText(i, r));
}

/** The summary under the numbers, written from them, as computeCompatibility writes it in English. */
export function compatSummary(i: I18n, r: Compatibility): string {
  if (i.locale === "en") return r.summary;
  const { f } = i;
  const s = i.t.compat.summary;
  const them = r.people.them.name;
  const parts: string[] = [f(s.total, { total: gunas(r.guna.total), verdict: verdictText(i, r.guna.total, r.guna.verdict) })];
  const ks = r.guna.kootas;
  const strongest = [...ks].sort((a, b) => b.score / b.max - a.score / a.max)[0];
  const weakest = [...ks].sort((a, b) => a.score / a.max - b.score / b.max)[0];
  if (strongest && weakest && strongest.key !== weakest.key) {
    parts.push(
      f(s.strongest, {
        s: kootaName(i, strongest),
        ss: gunas(strongest.score),
        sm: strongest.max,
        w: kootaName(i, weakest),
        ws: gunas(weakest.score),
        wm: weakest.max,
      }),
    );
  }
  const present = r.guna.doshas.filter((d) => d.present && d.kind !== "mangal");
  if (present.length > 0) {
    const names = i.list(present.map((d) => i.t.compat.kootas[d.kind === "nadi" ? "nadi" : "bhakoot"]));
    const exception = present.some((d) => d.exceptions.length > 0);
    parts.push(f(exception ? s.presentException : s.present, { names, count: present.length }));
  }
  const phrase = (x: SynastryAspect) =>
    f(s.aspect, { a: planet(i, x.a), aspect: i.t.compat.aspects[x.aspect], name: them, b: planet(i, x.b), orb: x.orb });
  const harmonious = r.synastry.aspects.find((x) => x.tone === "harmonious");
  const challenging = r.synastry.aspects.find((x) => x.tone === "challenging");
  if (harmonious) parts.push(f(s.warmest, { aspect: phrase(harmonious) }));
  if (challenging) parts.push(f(s.care, { aspect: phrase(challenging) }));
  parts.push(f(s.score, { score: r.synastry.score0to100 }));
  const youUnknown = !r.people.you.timeKnown, themUnknown = !r.people.them.timeKnown;
  if (youUnknown || themUnknown) {
    parts.push(f(youUnknown && themUnknown ? s.noTimeBoth : youUnknown ? s.noTimeYou : s.noTimeThem, { name: them }));
  }
  return parts.join(" ");
}

/** The question "Ask Astrya about us" asks, in the reader's language. */
export function compatAskPrompt(i: I18n, r: Compatibility, relationship?: string): string {
  if (i.locale === "en") return r.askPrompt;
  const { f } = i;
  const p = i.t.compat.prompt;
  const them = r.people.them;
  const rel = relationship && relationship !== "other" ? (i.t.people.relationships as Record<string, string>)[relationship] : null;
  const present = r.guna.doshas.filter((d) => d.present && d.kind !== "mangal");
  const doshas = present.length
    ? f(p.doshas, { names: i.list(present.map((d) => i.t.compat.kootas[d.kind === "nadi" ? "nadi" : "bhakoot"])) })
    : "";
  return f(p.ask, {
    name: them.name,
    relation: rel ? f(p.relation, { relationship: rel }) : "",
    moon: sign(i, them.moonSign),
    nakshatra: nakshatra(i, them.nakshatra),
    sun: sign(i, them.sunSign),
    total: gunas(r.guna.total),
    doshas,
  });
}
