import {
  FACT_CATEGORIES,
  FACT_MAX_CHARS,
  FACT_MIN_CHARS,
  MAX_FACTS,
  isFactCategory,
  isFactConfidence,
  type FactCategory,
  type FactConfidence,
  type UserFact,
} from "./types";
import type { FactPlan } from "./store";

/**
 * Learning from chats: the rules and the validation for standing facts about
 * a person's life. Pure — the model call lives in lib/memory/extract.ts,
 * which asks for facts, the conversation summary and the predictions in one
 * Haiku call, and the iPhone's on-device model proposes the same changes
 * through POST /api/memory/ingest. Both go through {@link parseFactChanges}
 * and {@link planFactWrites} before anything is written.
 */

/** New facts one pass may add. A message that yields more is a life story, and the rest can wait. */
const MAX_ADDS_PER_PASS = 8;

export type FactChanges = {
  add: { fact: string; category: FactCategory; confidence?: FactConfidence }[];
  update: { id: string; fact: string }[];
  remove: string[];
};

const EMPTY: FactChanges = { add: [], update: [], remove: [] };

/**
 * The JSON schema for fact changes, as one property of the memory pass's
 * reply. Structured outputs guarantee the shape; {@link parseFactChanges}
 * still re-checks every field, because the shape says nothing about whether
 * an id is one of ours.
 */
export const FACT_CHANGES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["add", "update", "remove"],
  properties: {
    add: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fact", "category", "confidence"],
        properties: {
          fact: { type: "string" },
          category: { type: "string", enum: [...FACT_CATEGORIES] },
          confidence: { type: "string", enum: ["stated", "inferred"] },
        },
      },
    },
    update: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "fact"],
        properties: { id: { type: "string" }, fact: { type: "string" } },
      },
    },
    remove: { type: "array", items: { type: "string" } },
  },
} as const;

/** What counts as a fact and how to write one. Shared by every pass that proposes facts. */
export const FACT_RULES = `What counts as a fact:
- Something lasting the person states about their OWN life, now or as a plan: work or study, relationship status, who is in their family, their health, their money situation, where and how they live, their plans and goals, and what they are worried about.
- It must come from the person's newest message. Never take one from the astrologer's reply, from a prediction, or from a hypothetical. A question alone states nothing: "will I get married?" does not mean they are single.
- confidence is "stated" when they said it outright, "inferred" only when their words make it plain without saying it ("my husband says" means married). Never guess beyond that.
- About other people, keep only the relationship and what it means to the person ("Worried about father's health"). No private details about others beyond that.
- Skip passing moods, the question itself, and anything about astrology, charts, planets, signs or readings.

How to write a fact:
- One short neutral sentence in the third person without a subject: "Works as a nurse in Pune", "Engaged since June 2026", "Wants to move abroad in 2027", "Worried about father's health".
- Turn relative times into dates using today: "since June" becomes a month and year, "next year" becomes the year.
- Under 25 words.

Categories: work (job, study, career), relationships (partner, dating, marriage), family (parents, children, siblings), health, money (income, debt, savings, property bought or sold), home (where they live, moves), goals (plans and things they want), worries (what is on their mind), other.

Changes:
- add: a fact that is not already on the list in any wording.
- update: an existing fact the newest message changes or makes more precise ("Engaged" becomes "Married since March 2026"). Give its id and the whole new sentence.
- remove: an existing fact the newest message says is no longer true and that no update replaces. Give its id.
- Most messages change nothing. Then return three empty lists.`;

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Astrology in a "fact" means it came from a reading or a chart, not from the
 * person's life. "Bought a house" is a fact; "Saturn in the 10th house" is not.
 */
const ASTROLOGY =
  /\b(maha|antar)?dashas?\b|\btransits?\b|\bretrograde\b|\bsaturn\b|\bjupiter\b|\brahu\b|\bketu\b|\bnakshatra\b|\bascendant\b|\blagna\b|\bkundli\b|\bhoroscope\b|\bzodiac\b|\bsade sati\b|\bdoshas?\b|\bmanglik\b|\bbirth chart\b|\b\d+(st|nd|rd|th) house\b/i;

/** Normalises one fact sentence, or null when it should not be stored. */
export function cleanFact(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let text = oneLine(raw).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (text.length > FACT_MAX_CHARS) return null;
  if (text.length < FACT_MIN_CHARS) return null;
  if (ASTROLOGY.test(text)) return null;
  // A sentence, not a sentence fragment with a trailing full stop dangling.
  text = text.replace(/\s*\.$/, "");
  return text.length >= FACT_MIN_CHARS ? text : null;
}

/**
 * Validates the model's reply item by item. A bad item is dropped on its own;
 * a reply that is not the expected object at all yields no changes. Ids are
 * kept only when they name one of the user's existing facts.
 */
export function parseFactChanges(raw: unknown, existingIds: ReadonlySet<string>): FactChanges {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY;
  const obj = raw as Record<string, unknown>;

  const add: FactChanges["add"] = [];
  if (Array.isArray(obj.add)) {
    for (const item of obj.add) {
      if (!item || typeof item !== "object") continue;
      const { fact, category, confidence } = item as Record<string, unknown>;
      const text = cleanFact(fact);
      if (!text || !isFactCategory(category)) continue;
      add.push({ fact: text, category, confidence: isFactConfidence(confidence) ? confidence : "stated" });
    }
  }

  const update: FactChanges["update"] = [];
  if (Array.isArray(obj.update)) {
    for (const item of obj.update) {
      if (!item || typeof item !== "object") continue;
      const { id, fact } = item as Record<string, unknown>;
      const text = cleanFact(fact);
      if (typeof id !== "string" || !existingIds.has(id) || !text) continue;
      update.push({ id, fact: text });
    }
  }

  const remove: string[] = [];
  if (Array.isArray(obj.remove)) {
    for (const id of obj.remove) {
      if (typeof id === "string" && existingIds.has(id) && !remove.includes(id)) remove.push(id);
    }
  }

  return { add, update, remove };
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same fact in near-same words: identical once normalised, or 80% word overlap. */
export function isDuplicateFact(a: string, b: string): boolean {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / new Set([...wa, ...wb]).size >= 0.8;
}

/**
 * Turns validated changes into the writes to make: drops duplicates of what
 * is already known, drops no-op updates, and keeps the list at `max` by
 * deleting the oldest "other" facts first, then the oldest of the rest.
 * Facts touched in this pass are never the ones evicted.
 */
export function planFactWrites(
  existing: UserFact[],
  changes: FactChanges,
  max: number = MAX_FACTS,
): FactPlan {
  const byId = new Map(existing.map((f) => [f.id, f]));
  const deletes = new Set(changes.remove.filter((id) => byId.has(id)));

  const updates: FactPlan["updates"] = [];
  const textOf = new Map(existing.map((f) => [f.id, f.fact]));
  for (const u of changes.update) {
    const current = byId.get(u.id);
    if (!current || deletes.has(u.id)) continue;
    if (normalise(current.fact) === normalise(u.fact)) continue;
    if (updates.some((x) => x.id === u.id)) continue;
    updates.push(u);
    textOf.set(u.id, u.fact);
  }

  const kept = () => [...textOf.entries()].filter(([id]) => !deletes.has(id)).map(([, text]) => text);
  const inserts: FactPlan["inserts"] = [];
  const confirms = new Set<string>();
  for (const a of changes.add) {
    if (inserts.length >= MAX_ADDS_PER_PASS) break;
    // Said again: nothing to add, but it is still true as of today.
    const again = existing.find((f) => !deletes.has(f.id) && isDuplicateFact(textOf.get(f.id) ?? f.fact, a.fact));
    if (again) {
      confirms.add(again.id);
      continue;
    }
    if (kept().some((t) => isDuplicateFact(t, a.fact))) continue;
    if (inserts.some((i) => isDuplicateFact(i.fact, a.fact))) continue;
    inserts.push(a);
  }

  let overflow = existing.length - deletes.size + inserts.length - max;
  if (overflow > 0) {
    const touched = new Set(updates.map((u) => u.id));
    const evictable = existing
      .filter((f) => !deletes.has(f.id) && !touched.has(f.id))
      .sort((a, b) => {
        const ao = a.category === "other" ? 0 : 1;
        const bo = b.category === "other" ? 0 : 1;
        return ao - bo || a.updated_at.localeCompare(b.updated_at);
      });
    for (const f of evictable) {
      if (overflow <= 0) break;
      deletes.add(f.id);
      overflow--;
    }
    // Only reachable when this pass's own updates fill the list: keep what
    // the user already had over what was just inferred.
    if (overflow > 0) inserts.splice(Math.max(0, inserts.length - overflow));
  }

  const touched = new Set([...updates.map((u) => u.id), ...deletes]);
  return { inserts, updates, deletes: [...deletes], confirms: [...confirms].filter((id) => !touched.has(id)) };
}

/**
 * Whether a message is worth a model call. Most turns are questions about the
 * chart; a fact about one's own life almost always comes with "I", "my" or
 * "we". The exception is a short answer to a question the astrologer asked
 * ("yes, since June"), so a reply ending in a question lets anything through.
 */
export function worthReading(message: string, previousReply?: string | null): boolean {
  const text = message.trim();
  if (text.length < 8) return false;
  if (previousReply && previousReply.trim().endsWith("?")) return true;
  // "my Saturn", "my 7th house", "my chart" are about the chart, not their life.
  const withoutChart = text.replace(CHART_POSSESSIVE, " ");
  return /\b(i|i'm|im|i've|ive|i'd|i'll|my|me|mine|myself|we|we're|we've|our|us)\b/i.test(withoutChart);
}

const CHART_POSSESSIVE =
  /\bmy\s+(birth chart|chart|kundli|horoscope|reading|readings|sign|sun sign|moon sign|ascendant|lagna|sun|moon|mars|mercury|jupiter|venus|saturn|rahu|ketu|(maha|antar)?dasha|nakshatra|numbers?|mulank|bhagyank|\d+(st|nd|rd|th)( house)?|houses?)\b/gi;
