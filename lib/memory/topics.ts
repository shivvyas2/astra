import type { FactCategory } from "@/lib/facts/types";
import { CATEGORY_TOPIC, type Topic } from "./types";

/**
 * Which part of life a question is about, from its words alone — no model
 * call. Each topic maps to the houses a reading of it starts from, which is
 * also how a question that names a house ("my 7th") finds its topic.
 *
 * Deliberately simple keyword matching: it only decides which remembered
 * facts, summaries and predictions are worth putting in front of the reading
 * model, and a miss costs nothing worse than v1's behaviour of sending the
 * core facts alone.
 */
export const TOPIC_HOUSES: Record<Topic, number[]> = {
  career: [10, 6],
  relationships: [7],
  money: [2, 11],
  health: [6, 1],
  home: [4],
  family: [2, 4],
  children: [5],
  travel: [9, 12],
  education: [4, 5, 9],
  general: [],
};

const KEYWORDS: [Topic, RegExp][] = [
  [
    "career",
    /\b(career|job|jobs|work|working|office|boss|promotion|promoted|salary|hike|appraisal|interview|offer|resign|quit|fired|layoffs?|laid off|business|startup|company|employer|profession|nurse|engineer|doctor|manager|client|project|founder)\b/i,
  ],
  [
    "relationships",
    /\b(marriage|marry|married|marrying|wedding|spouse|husband|wife|partner|boyfriend|girlfriend|fianc[eé]e?|engaged|engagement|dating|love|relationship|breakup|break up|divorce|separation|romance|soulmate)\b/i,
  ],
  [
    "money",
    /\b(money|finance|finances|financial|income|wealth|savings|save|debt|loan|emi|invest|investment|investing|stocks?|shares|crypto|property|inheritance|profit|loss|rich|earn|earning|bonus|tax)\b/i,
  ],
  [
    "health",
    /\b(health|healthy|ill|illness|sick|disease|surgery|operation|hospital|recovery|recover|pain|anxiety|depression|stress|sleep|diet|weight|fitness|pregnan\w*|medical|diagnos\w*)\b/i,
  ],
  [
    "home",
    /\b(home|house|flat|apartment|move|moving|relocat\w*|rent|renting|landlord|buy a house|new place|city|settle|neighbourhood|neighborhood)\b/i,
  ],
  [
    "family",
    /\b(family|mother|mom|mum|father|dad|parents?|brother|sister|sibling|in-laws?|grandmother|grandfather|relatives?)\b/i,
  ],
  ["children", /\b(child|children|kids?|baby|babies|son|daughter|conceive|conception|fertility|ivf)\b/i],
  [
    "travel",
    /\b(travel|travell?ing|trip|abroad|overseas|foreign|visa|immigrat\w*|emigrat\w*|green card|settle abroad|usa|uk|canada|australia|germany|dubai)\b/i,
  ],
  [
    "education",
    /\b(study|studies|studying|exam|exams|college|university|degree|masters|mba|phd|school|course|admission|gre|gmat|ielts|neet|jee|upsc)\b/i,
  ],
];

const HOUSE_TOPIC: Record<number, Topic> = {
  2: "money",
  4: "home",
  5: "children",
  6: "health",
  7: "relationships",
  9: "travel",
  10: "career",
  11: "money",
  12: "travel",
};

const HOUSE_MENTION = /\b(1[0-2]|[1-9])(st|nd|rd|th)\b(\s+house|\s+lord)?/gi;
const HOUSE_WORD: Record<string, number> = {
  second: 2,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
};

/** Topics the text is about, in the fixed topic order. Never "general". */
export function topicsForText(text: string): Topic[] {
  const found = new Set<Topic>();
  // "my 7th house" is about marriage, not a home: house numbers are read
  // below, and taken out before the words are.
  const words = text
    .replace(HOUSE_MENTION, " ")
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+(house|lord)s?\b/gi, "$1");
  for (const [topic, re] of KEYWORDS) if (re.test(words)) found.add(topic);
  for (const m of text.matchAll(HOUSE_MENTION)) {
    const topic = HOUSE_TOPIC[Number(m[1])];
    if (topic) found.add(topic);
  }
  for (const [word, house] of Object.entries(HOUSE_WORD)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) {
      const topic = HOUSE_TOPIC[house];
      if (topic) found.add(topic);
    }
  }
  return KEYWORDS.map(([t]) => t).filter((t) => found.has(t));
}

/** The topics a stored fact bears on: its category's, plus whatever its words name. */
export function factTopics(fact: { fact: string; category: FactCategory }): Topic[] {
  const topics = new Set(topicsForText(fact.fact));
  const own = CATEGORY_TOPIC[fact.category];
  if (own) topics.add(own);
  return [...topics];
}
