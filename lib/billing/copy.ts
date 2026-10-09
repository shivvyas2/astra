/**
 * Words shown on the AI consent screen and the Plus page, on the web. The
 * iPhone carries the same text in ConsentCopy.swift and PlusCopy.swift; change
 * both together. A material change to what the consent screen says should also
 * bump CONSENT_VERSION (lib/billing/consent.ts) so everyone is asked again.
 *
 * Client-safe: no server imports.
 */

export type ConsentSection = { label: string; title: string; points: string[] };

export const CONSENT_COPY = {
  eyebrow: "Your data",
  title: "Before your first reading",
  intro:
    "Astrya's readings are written by an AI model made by Anthropic. To write one, your details have to be sent to it. Here is exactly what goes where.",
  sections: [
    {
      label: "Sent",
      title: "What is sent",
      points: [
        "Your birth date, time and place, and the chart worked out from them.",
        "The questions you ask and the conversation so far.",
        "Facts Astrya remembers about you, and short notes from past readings.",
      ],
    },
    {
      label: "To",
      title: "Who receives it",
      points: [
        "Anthropic, the maker of Claude, only to write your reading. Under Anthropic's commercial terms it is not used to train their models.",
        "On iPhones with Apple Intelligence, some answers and notes are made by Apple's on-device model. That stays on your phone.",
      ],
    },
    {
      label: "Kept",
      title: "What is kept, and where",
      points: [
        "Your birth details, chart, conversations and remembered facts are stored in Astrya's database (Supabase).",
        "The Astrya team can read conversations and what Astrya remembers, to fix problems and keep readings safe.",
        "It stays until you delete it or your account.",
      ],
    },
    {
      label: "Yours",
      title: "Your choices",
      points: [
        "See or delete what Astrya remembers in Profile, under What Astrya knows.",
        "Delete your account and everything in it from Profile at any time.",
        "Withdraw this consent in Profile whenever you like. Readings pause until you agree again.",
      ],
    },
  ] satisfies ConsentSection[],
  agree: "Agree and continue",
  notNow: "Not now",
  declinedTitle: "Readings need this",
  declinedBody:
    "Every reading is written by Anthropic's model from your chart and your question, so Astrya can't read for you without sending them. Nothing has been sent. Come back to this whenever you're ready.",
  reviewAgain: "Review again",
} as const;

/**
 * OWNER: decide what Plus includes before shipping it, and edit this list.
 *
 * Every line must be true on the day it ships. Today Plus gates nothing:
 * readings are unlimited for everyone and Deep readings are open to all, so
 * the honest offer is support. Do not add "more readings" or "unlock" lines
 * unless the product actually changes. Mirror edits in PlusCopy.swift.
 */
export const PLUS_BENEFITS: { title: string; detail: string }[] = [
  {
    title: "Keep Astrya independent",
    detail: "Plus pays for the model calls and the ephemeris behind every reading. No ads, no data sales.",
  },
  {
    title: "Three more app icons",
    detail: "The Astrya mark in lime, violet or bone on your iPhone home screen. Change it any time under You → App icon.",
  },
  {
    title: "A thank-you mark",
    detail: "A Plus badge on your profile. Every reading stays free and unlimited for everyone.",
  },
];

export const PLUS_PRICES = {
  monthly: { id: "com.shivvyas.astra.plus.monthly", label: "Monthly", price: "$6.99", per: "month" },
  yearly: { id: "com.shivvyas.astra.plus.yearly", label: "Yearly", price: "$49.99", per: "year", perMonth: "$4.17" },
} as const;

/** Apple's standard licence agreement, used as the Terms of Use for subscriptions. */
export const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const PRIVACY_PATH = "/privacy";
export const MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
