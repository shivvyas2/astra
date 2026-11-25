import type Anthropic from "@anthropic-ai/sdk";
import { ACTIVITIES } from "@/lib/panchang/muhurat";
import { VARGAS } from "@/lib/astrology/vargas";

/**
 * What a Vedic reading can look up beyond the chart in its prompt, so nobody
 * pays for all of it on every question. One tool, one call for several things.
 * Constant bytes, as for MATCH_TOOLS: tools come ahead of the cached chart.
 */
export const TOPICS = ["D1", ...VARGAS, "dasha", "sade_sati", "ashtakavarga", "muhurat"] as const;
export type LookupTopic = (typeof TOPICS)[number];

const nullable = (description: string) => ({ anyOf: [{ type: "string" }, { type: "null" }], description });

export const LOOKUP_TOOL = {
  name: "look_up",
  strict: true,
  description:
    "Computes what is not in the chart above. Call it whenever the question needs it, in any language: divisional charts (D9 navamsa for marriage and what a partner is like; D7 for children; D10 for career; and the others), every dasha and antardasha date from birth on, Sade Sati and Dhaiya dates, ashtakavarga points, and muhurat (a good day or hour for something, today's panchang, tithi, Rahu Kaal, choghadiya). Also call it to draw a chart they ask to see. Ask for everything you need in one call. Write nothing before calling it. Not for a question the chart above already answers.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      topics: { type: "array", items: { type: "string", enum: [...TOPICS] }, description: "What to look up. D1 is the birth chart itself, only ever needed for drawing." },
      whose: { type: "string", enum: ["self", "other", "both"], description: "Whose chart. other and both only when a second person's chart is in this conversation." },
      draw: { type: "boolean", description: "True when they ask to see, show, draw or make a chart or the dasha timeline, or ask for a divisional chart by name. Draws D1, a divisional chart, the ashtakavarga or the dasha timeline in the conversation." },
      activity: { anyOf: [{ type: "string", enum: [...ACTIVITIES] }, { type: "null" }], description: "For muhurat: what the day is for. home is a house entry or purchase. general for anything else, and for a plain panchang. Null otherwise." },
      from: nullable("For muhurat: first day, YYYY-MM-DD, from what they said and today's date. Null for today."),
      to: nullable("For muhurat: last day, YYYY-MM-DD. The same as from for one day. Null for the next 60 days."),
      place: nullable("For muhurat: the town they said it is for, in English letters. Null when they did not say; their birthplace is then used."),
    },
    required: ["topics", "whose", "draw", "activity", "from", "to", "place"],
  },
} as unknown as Anthropic.Tool;

/** Added to the cached chart block of a Vedic chat, after the chart rules. */
export const LOOKUP_RULES = `

Looking things up:
- You have look_up for D2 to D60, all dasha dates, Sade Sati dates, ashtakavarga and muhurat. Never say you do not have one of these, cannot draw a chart, or cannot give those dates: call look_up. What it returns counts as listed above, and can be cited in the last section.
- What a partner is like, how or when they will meet, love or arranged: read the 7th house, its lord, Venus and Jupiter together with D9. Describe their nature, manner, background and kind of work. Not a name.
- Children: read the 5th house, Jupiter and D7. Say how strongly the chart supports children and when. Never give a fixed number as certain, and never a baby's sex.
- When a chart was drawn, it is already on their screen above your words: read it, do not list it out again.
- No chart holds a name, a sum of money, a lottery number, a count of past partners, or what someone privately feels. Say that in one short clause, then answer the part the chart does show.`;
