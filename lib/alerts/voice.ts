import { NO_EM_DASH } from "@/lib/writing";

/**
 * How a notification sounds. Two lines on a lock screen that make someone want
 * the reading, and that the reading then keeps its word on: spicy, and true.
 */
export const PUSH_VOICE = `HOW THE TITLE AND BODY SOUND
You are the friend who reads their chart and tells it straight: quick, warm, a little cheeky, sure of yourself. Someone glancing at a locked phone should feel "wait, how does it know that?" and open it.
- TITLE is a hook about their life, not the sky: a choice, a habit, a person, a conversation, a plan, a date. Planets, signs, houses, doshas and the Moon stay out of the title and the body. They belong in DETAIL.
- BODY adds one thing they can check for themselves today (a situation, how someone acts, what they do next, a date you were given) and stops just short of the answer. The answer is in DETAIL, near the top. Never a hook that DETAIL does not answer.
- One idea. Short words. Talk to them: "you", a question, a dare, a nudge, a callback to what they asked. A contradiction is good ("You already know the answer. You want permission.").
- A chart does not hold clock times. Never name an hour, and never say something will happen before lunch or after four. Dates only as given. "Today", "tonight" and "tomorrow" are fine.
- Never make up a person or an event: no "your brother", "your boss", "a message arrived" unless it is in their notes. "Someone" is fine. How they tend to behave may be said outright; what already happened today is asked, not told ("Did you agree to something you didn't mean?").
- Every claim in it follows from the facts you were given. Spicy comes from being specific and honest about how they behave, never from exaggerating.
- Never these words or their translations: steady, quiet, calm, gentle, gently, soft, softly, heavy, energy, vibes, universe, cosmic, patience, focus, balance, today favours, tomorrow opens.
- Never scare, shame or rush them. No doom, illness, death, accident, pregnancy, cheating, breakup or money loss foretold. No "last chance", no "don't miss", no "we miss you", no betting or investing tips. Nothing about anyone's body.
- A lock screen is read by other people too. Never put a person's name, a place, an employer, an illness, a debt, a sum, a relationship problem, a worry or anything they confided in TITLE or BODY. "That thing you asked about work" is the most you may say; for love, family, health or money trouble say only "the question you keep coming back to". DETAIL may be open with them.
- No emoji, no exclamation marks, no all capitals. ${NO_EM_DASH}
The shape of a good one, not lines to reuse: "You're rehearsing a text again" / "Send half of it. The other half is for you, and here's why." · "You keep going back to look" / "At the price, or the profile. What you're really pricing is inside." · "11 days until this shifts" / "You asked about work on Tuesday. The date has an opinion."`;

/** For someone who has told Astrya they are hurting: no teasing, and nothing to lean on. */
export const TENDER_VOICE = `HOW THE TITLE AND BODY SOUND
They have shared something painful recently. Write as a kind friend would: plain, warm, unhurried, one small doable thing. No teasing, no hooks, no curiosity gaps, no hard timing, nothing about what they confided, no predictions about loss, health or other people. Planets, signs and houses stay out of TITLE and BODY. No emoji. ${NO_EM_DASH}`;

/** Pain that a cheeky line would land badly on: in English, Hinglish, Gujlish, Hindi and Gujarati. */
const TENDER =
  /suicid|kill (myself|me)|end(ing)? (my|it|this) (life|all)|want to die|don'?t want to live|self.?harm|hurt myself|no reason to live|depress|panic attack|abus(e|ed|ive|ing)\b|assault|violen|miscarr|stillb|cancer|tumou?r|terminal|chemo|funeral|passed away|\bdied\b|death of|grie(f|ving)|widow|khudkh?ushi|aatma ?hatya|atma ?hatya|mar(na|ne) (chaht|chah|ka man)|jeena nahi|jina nahi|marvu|marvano|aapghat|apghat|आत्महत्या|ख़ुदकुशी|खुदकुशी|मरना चाह|जीना नहीं|डिप्रेशन|अवसाद|कैंसर|गुज़र गए|गुजर गए|देहांत|આત્મહત્યા|આપઘાત|મરવું|જીવવું નથી|ડિપ્રેશન|કેન્સર|અવસાન|ગુજરી ગય/i;

export const isTender = (texts: string[]) => texts.some((t) => TENDER.test(t));

const STALE =
  /\b(steady|steadier|steadying|quiet|quieter|quietly|calm|calmer|gentle|gently|gentler|soft|softly|softer|heavy|energy|vibes?|universe|cosmic|patience)\b|today favou?rs|tomorrow opens|शांत|स्थिर|ऊर्जा|धैर्य|શાંત|સ્થિર|ઊર્જા|ધીરજ/i;
const SKY =
  /\b(sun|moon|mars|mercury|venus|jupiter|saturn|rahu|ketu|surya|chandra|mangala?|budha?|guru|shukra|shani|ascendant|lagna|nakshatra|retrograde|transit\w*|natal|dosha|yoga|sade sati|dasha|antardasha|mahadasha|\d{1,2}(st|nd|rd|th)[- ]house|house \d{1,2}|aries|taurus|gemini|leo|virgo|cancer|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b|सूर्य|चंद्र|मंगल|बुध|गुरु|शुक्र|शनि|राहु|केतु|भाव|सूર્ય|સૂર્ય|ચંદ્ર|મંગળ|બુધ|ગુરુ|શુક્ર|શનિ|રાહુ|કેતુ|ભાવ/i;
const PUSHY = /[!\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|—|last chance|don'?t miss|we miss you|miss you|hurry|act now|before it'?s too late|\bdie\b|death|divorce|cheat|affair|accident|pregnan|disease|lottery|jackpot|\bstocks?\b|crypto/iu;

const SUM = /[₹$€£] ?\d|\b\d[\d,.]* ?(rs\.?|rupees?|lakhs?|crores?|dollars?|usd|inr|k\b)/i;

/** Everyday words that are capitalised without naming anyone. */
const NOT_NAMES = new Set(
  ("i i'm astrya asked wants worried works lives has is was said told they he she their user people january february march april may june july august september october november december " +
    "jan feb mar apr jun jul aug sep sept oct nov dec monday tuesday wednesday thursday friday saturday sunday sun moon mars mercury venus jupiter saturn rahu ketu hindi gujarati english vedic western " +
    "aries taurus gemini cancer leo virgo libra scorpio sagittarius capricorn aquarius pisces d9 d7 d10 possible likely unlikely the a an and or in on of to for with").split(" "),
);

/**
 * The people and places named in what they told Astrya: every capitalised word
 * that does not open a sentence. Over-cautious on purpose; a hook loses
 * nothing by not naming a town.
 */
export function namesIn(texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/(?<=[\p{L}\p{N},;:'")] )(\p{Lu}[\p{L}'-]{2,})/gu)) {
      const w = m[1].toLowerCase().replace(/'s$/, "");
      if (!NOT_NAMES.has(w)) out.add(w);
    }
  }
  return [...out];
}

/** A clock time, which no chart gives. */
const HOUR = /\b\d{1,2}([:.]\d{2})? ?(am|pm|a\.m|p\.m|o'?clock|baje|vagye|vage)\b|\bbetween \d{1,2} and \d{1,2}\b|\b(before|after|by|at) \d{1,2}\b(?! ?(days?|weeks?|months?|years?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))|\d{1,2} बजे|[0-9૦-૯]{1,2} વાગ્યે/i;

const words = (s: string) => s.toLowerCase().normalize("NFC").match(/[\p{L}\p{M}\p{N}']+/gu) ?? [];
const COMMON = new Set("a an the to of in on is it you your you're and for that this with at be but not are was".split(" "));

/** Two titles that would feel like the same notification twice. */
export function tooAlike(title: string, earlier: string): boolean {
  const a = words(title);
  const b = words(earlier);
  if (a.length && a.slice(0, 2).join(" ") === b.slice(0, 2).join(" ")) return true;
  const A = new Set(a.filter((w) => !COMMON.has(w)));
  const B = new Set(b.filter((w) => !COMMON.has(w)));
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared >= 2 && shared / Math.min(A.size, B.size) >= 0.6;
}

/**
 * What is wrong with a lock-screen line, or null. Said back to the writer for
 * one more try. `sky` is allowed where the sky is the news (a dosha alert).
 */
export function faultIn(copy: { title: string; body: string }, opts: { recent?: string[]; tender?: boolean; sky?: boolean; secret?: string[] } = {}): string | null {
  const both = `${copy.title}\n${copy.body}`;
  const pushy = PUSHY.exec(both);
  if (pushy) return `TITLE and BODY may not contain "${pushy[0]}".`;
  const sum = SUM.exec(both);
  if (sum) return `TITLE and BODY may not contain a sum of money ("${sum[0]}").`;
  const seen = new Set(words(both).map((w) => w.replace(/'s$/, "")));
  const leak = opts.secret?.find((s) => seen.has(s));
  if (leak) return `TITLE and BODY may not contain "${leak}": it names someone or somewhere from their life, and others can read a lock screen.`;
  if (!opts.tender) {
    const stale = STALE.exec(both);
    if (stale) return `"${stale[0]}" is one of the worn-out words. Say something only they would recognise.`;
  }
  const hour = HOUR.exec(both);
  if (hour) return `"${hour[0]}" is a clock time, and a chart holds none. Say it without the hour.`;
  const sky = opts.sky ? null : SKY.exec(both);
  if (sky) return `"${sky[0]}" is astrology talk; keep it for DETAIL and say what it does in their life instead.`;
  const twin = opts.recent?.find((r) => tooAlike(copy.title, r));
  if (twin) return `The title is too close to one they already had: "${twin}". Change the subject and the opening words.`;
  return null;
}
