import { DateTime } from "luxon";
import type { GeoResult } from "@/lib/geo";
import { createI18n } from "@/lib/i18n/core";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/en";
import { messagesFor } from "@/lib/i18n/dictionaries";
import { isRelationship, RELATIONSHIPS, type Relationship } from "@/lib/profiles/types";
import type { MatchCard } from "./matchCard";

export { CARD_SEPARATOR, splitCard, type MatchCard } from "./matchCard";

/**
 * Matching inside a reading (docs/design/2026-11-24-chat-matching.md).
 *
 * The reading model only says which details it heard. Everything the person
 * is shown, and everything that is saved, is worked out here: the read-back
 * is written by code, and a "yes" is answered by parsing that same read-back
 * out of Astrya's own last message. What was shown is what gets saved.
 */

/** What they are writing in. Hinglish is Hindi in English letters. */
export type Voice = "english" | "hindi" | "gujarati" | "hinglish";
const VOICE_LOCALE: Record<Voice, Locale> = { english: "en", hindi: "hi", gujarati: "gu", hinglish: "en" };

/** The card's and read-back's words in Hinglish, which has no dictionary: it is a way of typing, not a setting. */
const HINGLISH: Partial<Messages["chat"]["match"]> = {
  intro: "Kya yeh sahi hai?",
  reply: '"Haan" likhiye aur main aap dono ki kundli mila dungi, ya bataiye kya badalna hai.',
  tapCard: "Neeche details check kar lijiye, phir main aap dono ki kundli mila dungi.",
  fill: "Aapki kundli kiske saath milaun? Neeche unki birth details bhariye.",
  askPerson: "Unka naam, birth date, birth time aur birth place bataiye, phir main kundli mila dungi.",
  ask: "Kundli milane ke liye mujhe abhi chahiye: {missing}.",
  missingName: "unka naam",
  missingDate: "unki birth date, saal ke saath",
  missingTime: "unka birth time (ya bataiye ki pata nahi)",
  missingPlace: "unka birth place",
  placeUnknown: "Mujhe {place} nahi mila. Paas ka bada sheher, state ya country ke saath bataiye.",
  placeOther: "Agar yeh sahi jagah nahi hai, to state ya country bataiye.",
  whichDate: "Birth date {first} hai ya {second}?",
};

export type Proposal = {
  language: Voice | null;
  name: string;
  relationship: Relationship;
  birthDate: string | null;
  altBirthDate: string | null;
  birthTime: string | null;
  timeKnown: boolean;
  place: string | null;
};

export type Details = {
  name: string;
  relationship: Relationship;
  birthDate: string;
  birthTime: string | null;
  timeKnown: boolean;
  place: string;
};

export type Places = { places: GeoResult[]; ambiguous: boolean };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function realDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = DateTime.fromISO(value, { zone: "utc" });
  if (!d.isValid || d.year < 1800 || d > DateTime.utc().plus({ days: 1 })) return null;
  return value;
}

/** Drops whatever would break the read-back's one line. */
export function plain(value: string, max: number): string {
  return value.replace(/[*_`>·()[\]<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** The tool's input, checked. Null when it is not the shape the tool declares. */
export function readProposal(input: unknown): Proposal | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const text = (key: string): string | null | undefined => {
    const v = o[key];
    if (v === null || v === undefined) return null;
    return typeof v === "string" ? v.trim() || null : undefined;
  };
  const [name, date, alt, time, place] = ["name", "birth_date", "alternate_birth_date", "birth_time", "place"].map(text);
  if ([name, date, alt, time, place].includes(undefined)) return null;
  const birthDate = realDate(date ?? null);
  const altBirthDate = realDate(alt ?? null);
  const birthTime = time && TIME.test(time) ? time : null;
  const language = typeof o.language === "string" && o.language in VOICE_LOCALE ? (o.language as Voice) : null;
  return {
    language,
    name: plain(name ?? "", 60),
    relationship: isRelationship(o.relationship) ? o.relationship : "other",
    birthDate: birthDate ?? altBirthDate,
    altBirthDate: birthDate && altBirthDate && birthDate !== altBirthDate ? altBirthDate : null,
    birthTime,
    timeKnown: birthTime !== null || o.birth_time_unknown !== true,
    place: place ? plain(place, 80) : null,
  };
}

const day = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setLocale("en").toFormat("d LLL yyyy");

/** "> **Priya** (Partner) · 21 Aug 1996, 2:10 PM · Nagpur, Maharashtra, India" */
export function detailsLine(d: Details, locale: Locale): string {
  const t = messagesFor(locale);
  const time =
    d.timeKnown && d.birthTime
      ? DateTime.fromFormat(d.birthTime, "HH:mm", { zone: "utc" }).setLocale("en").toFormat("h:mm a")
      : t.people.timeUnknown;
  return `> **${plain(d.name, 60)}** (${t.people.relationships[d.relationship]}) · ${day(d.birthDate)}, ${time} · ${plain(d.place, 160)}`;
}

const LINE = /^> \*\*(.+?)\*\* \(([^)]+)\) · (\d{1,2} [A-Z][a-z]{2} \d{4}), ([^·\n]+) · (.+)$/m;

/** The details Astrya last read back, or null when that message read none back. */
export function parseDetailsLine(text: string | null | undefined): Details | null {
  const m = text?.match(LINE);
  if (!m) return null;
  const date = DateTime.fromFormat(m[3], "d LLL yyyy", { zone: "utc", locale: "en" });
  if (!date.isValid) return null;
  const time = DateTime.fromFormat(m[4].trim(), "h:mm a", { zone: "utc", locale: "en" });
  return {
    name: m[1],
    relationship: relationshipFromLabel(m[2]),
    birthDate: date.toISODate()!,
    birthTime: time.isValid ? time.toFormat("HH:mm") : null,
    timeKnown: time.isValid,
    place: m[5].trim(),
  };
}

function relationshipFromLabel(label: string): Relationship {
  for (const locale of LOCALES) {
    const labels = messagesFor(locale).people.relationships;
    const hit = RELATIONSHIPS.find((r) => labels[r] === label);
    if (hit) return hit;
  }
  return "other";
}

/**
 * The places a typed birthplace could mean, best first.
 *
 * The lookup knows town names, not "Patan Gujarat" or "Nagpur, MH", so when
 * the whole phrase finds nothing the trailing words are dropped one at a time
 * and then used to rank what the town alone finds.
 */
export async function resolvePlaces(query: string, geocode: (q: string) => Promise<GeoResult[]>): Promise<Places> {
  const none: Places = { places: [], ambiguous: false };
  const words = query.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const tries = [query.trim()];
  const town = query.split(",")[0].trim();
  if (town && !tries.includes(town)) tries.push(town);
  for (let i = words.length - 1; i >= 1; i--) {
    const q = words.slice(0, i).join(" ");
    if (!tries.includes(q)) tries.push(q);
  }
  try {
    for (const q of tries.slice(0, 5)) {
      const found = await geocode(q);
      if (found.length === 0) continue;
      const unique = found.filter((p, i) => found.findIndex((x) => x.name === p.name) === i);
      const wanted = words.map((w) => w.toLowerCase());
      const exact = query.trim().toLowerCase();
      const score = (p: GeoResult) => {
        const name = p.name.toLowerCase();
        if (name === exact) return Infinity;
        const parts = name.split(/[\s,]+/);
        return wanted.filter((w) => parts.includes(w)).length;
      };
      const ranked = unique.map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s);
      const best = ranked.filter((r) => r.s === ranked[0].s);
      return { places: ranked.map((r) => r.p), ambiguous: best.length > 1 };
    }
  } catch (err) {
    console.error("chat match place lookup failed", err);
  }
  return none;
}

export type Reply = { text: string; card: MatchCard | null };

/** What Astrya says back to a proposal, and the card to say it with. */
export async function reply(
  p: Proposal,
  opts: { cards: boolean; locale: Locale; find: (place: string) => Promise<Places> },
): Promise<Reply> {
  // In the language they typed, whatever the app is set to.
  const locale = p.language ? VOICE_LOCALE[p.language] : opts.locale;
  const t = messagesFor(locale);
  const { f, list } = createI18n(locale, t);
  const m = p.language === "hinglish" ? { ...t.chat.match, ...HINGLISH } : t.chat.match;
  const join = p.language === "hinglish" ? (items: string[]) => items.join(", ") : list;
  const card = (over: Partial<MatchCard>): MatchCard => ({
    type: "match",
    name: p.name,
    relationship: p.relationship,
    birthDate: p.birthDate,
    altBirthDate: p.altBirthDate,
    birthTime: p.birthTime,
    timeKnown: p.timeKnown,
    places: [],
    placeAmbiguous: false,
    ...over,
  });

  const needsTime = p.timeKnown && !p.birthTime;
  if (!p.birthDate && !p.birthTime && !p.place) {
    return opts.cards ? { text: m.fill, card: card({}) } : { text: m.askPerson, card: null };
  }
  const missing = [
    !p.name && m.missingName,
    !p.birthDate && m.missingDate,
    needsTime && m.missingTime,
    !p.place && m.missingPlace,
  ].filter((x): x is string => Boolean(x));
  if (missing.length > 0) return { text: f(m.ask, { missing: join(missing) }), card: null };

  const { places, ambiguous } = await opts.find(p.place!);
  if (places.length === 0) return { text: f(m.placeUnknown, { place: p.place! }), card: null };

  if (p.altBirthDate) {
    const question = f(m.whichDate, { first: day(p.birthDate!), second: day(p.altBirthDate) });
    return { text: question, card: opts.cards ? card({ places, placeAmbiguous: ambiguous }) : null };
  }
  if (opts.cards && ambiguous) return { text: m.tapCard, card: card({ places, placeAmbiguous: true }) };

  const line = detailsLine(
    {
      name: p.name,
      relationship: p.relationship,
      birthDate: p.birthDate!,
      birthTime: p.birthTime,
      timeKnown: p.timeKnown,
      place: places[0].name,
    },
    locale,
  );
  const text = [m.intro, line, opts.cards ? m.tapCard : [ambiguous && m.placeOther, m.reply].filter(Boolean).join(" ")].join("\n\n");
  return { text, card: opts.cards ? card({ places }) : null };
}
