/**
 * Someone who may be in danger. Never turned away, never flagged, never
 * answered with a prediction: care first, and a number for where they are.
 * Words only, so it cannot be down; the rule in every prompt covers what these
 * words miss. Client-safe.
 */
const SELF_HARM =
  /suicid|kill(ing)? myself\b|\bkill me\b|end(ing)? (my|this) (life|own life)|end it all|(want|wanna|going|ready|wish) to die\b|wanna die\b|want(ed)? to be dead|better off dead|better (off )?without me|(no ?one|nobody) (would|will) (miss me|care if i|notice if i)|don'?t want to (live|be alive|exist)|no (reason|point) (to|in) (live|living)|self.?harm|hurt(ing)? myself|cut(ting)? myself|take my (own )?life|overdos|khudkh?ushi|aatma ?hatya|atma ?hatya|(mar|marr?) ?jaa?na ?chaht|marna (hai|chaht|chah)|marne ka (man|mann)|jeena nahi|jina nahi|jaan (dena|de du|dedu)|mare (marvu|jivvu nathi)|mane (marvu|jivvu nathi)|jivvu nathi|marvu (che|chhe)|aapghat|apghat|आत्महत्या|ख़ुदकुशी|खुदकुशी|मरना (चाह|है)|मर जाना|मरने का मन|जीना नहीं|जीने का मन नहीं|जान दे|આત્મહત્યા|આપઘાત|મરી જવું|મરવું (છે|હતું)|જીવવું નથી|જીવવાનું મન નથી/i;

/** Being harmed by someone, now. */
const IN_DANGER =
  /(he|she|they|husband|wife|father|mother|boyfriend|girlfriend|partner|family) (is |are |keeps? )?(beat(s|ing)?|hit(s|ting)?|rap(ed|ing|es)|threaten(s|ing|ed)? to kill) me|i('m| am| was) (being )?(raped|molested|sexually (abused|assaulted))|domestic violence|mujhe (maarta|marta|maarti|marti|peet)|मुझे (मारता|मारती|पीट)|મને (મારે|મારે છે|મારતો|મારતી)/i;

export const isCrisis = (text: string) => SELF_HARM.test(text) || IN_DANGER.test(text);

export type Helpline = { name: string; number: string; emergency: string };

/** Free, national, all hours. A country not here gets the directory instead. */
const HELPLINES: Record<string, Helpline> = {
  IN: { name: "Tele-MANAS", number: "14416", emergency: "112" },
  US: { name: "988 Suicide & Crisis Lifeline", number: "988", emergency: "911" },
  CA: { name: "9-8-8 Suicide Crisis Helpline", number: "988", emergency: "911" },
  GB: { name: "Samaritans", number: "116 123", emergency: "999" },
  IE: { name: "Samaritans", number: "116 123", emergency: "112" },
  AU: { name: "Lifeline", number: "13 11 14", emergency: "000" },
  NZ: { name: "1737", number: "1737", emergency: "111" },
};
export const DIRECTORY = "findahelpline.com";

export const helplineFor = (country: string | null | undefined): Helpline | null => HELPLINES[(country ?? "").toUpperCase()] ?? null;

/**
 * Where to send someone, on every turn: pain is often said in words no list
 * holds, and the model must never reach for another country's number.
 */
export function localHelp(country: string | null | undefined): string {
  const h = helplineFor(country);
  return `\n\nCrisis line where they are now, only for someone in danger: ${h ? `${h.name}, ${h.number}; emergency ${h.emergency}` : `find it at ${DIRECTORY}, or their local emergency number`}. Give no other number.`;
}

/** Ahead of everything else in the day's block when the message shows danger. */
export function crisisRules(country: string | null | undefined): string {
  const h = helplineFor(country);
  const where = h
    ? `${h.name}, ${h.number}, free and open all hours; in immediate danger, ${h.emergency}`
    : `the helpline for their country at ${DIRECTORY}; in immediate danger, their local emergency number`;
  return `

THEY MAY BE IN DANGER. This comes before every other rule here.
- Do not read the chart, predict, or give a date. Do not use a tool. No headings, no "In simple words", no chart facts.
- In the language they wrote in, as one caring person to another, in under 120 words: say you are glad they told you, that how they feel matters, and that this can pass with help. Ask plainly whether they are safe right now.
- Ask them to reach someone today: a person they trust nearby, and ${where}. Give it exactly as written here.
- Never argue, lecture, judge, or say the planets caused it or will fix it. Never discuss ways to die. If they say they are being hurt by someone, believe them and say it is not their fault.`;
}

const ASK: Record<"en" | "hi" | "gu", (line: string) => string> = {
  en: (line) => `You don't have to carry this alone. Please reach someone now: ${line}.`,
  hi: (line) => `आपको यह अकेले नहीं झेलना है। कृपया अभी किसी से बात करें: ${line}.`,
  gu: (line) => `તમારે આ એકલા સહન કરવાનું નથી. કૃપા કરીને હમણાં કોઈ સાથે વાત કરો: ${line}.`,
};

/** The number itself, for a reply that came back without it. */
export function helplineLine(country: string | null | undefined, text: string): string {
  const h = helplineFor(country);
  const script = /[ऀ-ॿ]/.test(text) ? "hi" : /[઀-૿]/.test(text) ? "gu" : "en";
  return ASK[script](h ? `${h.name} ${h.number} (${h.emergency})` : DIRECTORY);
}

export function hasHelpline(reply: string, country: string | null | undefined): boolean {
  const h = helplineFor(country);
  const digits = (s: string) => s.replace(/[\s-]/g, "");
  return h ? digits(reply).includes(digits(h.number)) : reply.includes(DIRECTORY);
}
