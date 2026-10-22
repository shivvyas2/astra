import type { Widen } from "../core";

/**
 * The privacy policy and terms of use, in English: the authoritative text.
 * hi.ts and gu.ts translate it in full and say at the top that this version
 * governs. Server-only in practice: the legal pages are server components,
 * so none of this goes into the client's dictionary.
 *
 * `<terms>`, `<privacy>`, `<email>` and `<apple>` mark linked words; `{date}`
 * is LEGAL_UPDATED.
 */
export const legalEn = {
  /** Shown only on a translated page. */
  authoritative: "",
  privacy: {
    title: "Privacy",
    intro:
      "Last updated {date}. Astrya reads your birth chart with the help of an AI model. This page says what that involves. Inside the app you are asked to agree to it before your first reading, and you can withdraw that agreement in Profile at any time.",
    sections: [
      {
        title: "Accounts and hosting",
        points: [
          "Your email (or Sign in with Apple identifier) is used to sign you in. Data is stored with Supabase and the app runs on Vercel.",
          "Every table is protected so your account can only read its own rows. Server keys never leave the server.",
          "There is no advertising, no analytics SDK and no third-party crash reporter. Your data is not sold.",
          "Data is stored and processed in the United States.",
          "If you turn on alerts, your device's push token is stored so Astrya can send them. Deleting your account removes it; a token Apple reports as no longer valid is removed automatically.",
          "If you add someone else's birth details to compare charts, they are stored with your account and used only for your readings. Add them only with that person's permission.",
        ],
      },
      {
        title: "Mood check-ins and key dates",
        points: [
          "If you use the daily check-in, Astrya stores the date and the number you chose (1 to 5). Only your account can read it; the Astrya team cannot.",
          "Check-ins are compared with your chart on Astrya's own servers. They are never sent to Anthropic or any other AI.",
          "Key dates are computed from your chart. On iPhone, Add to calendar asks for write-only access: Astrya can add events but never reads your calendar.",
        ],
      },
    ],
    subscriptions: {
      title: "Subscriptions",
      points: [
        "Astrya Plus is sold through Apple. Apple handles payment; Astrya never sees your card.",
        "Astrya stores the subscription's product, status, renewal date and Apple's transaction id, to show your plan.",
        "Subscriptions are governed by Apple's <apple>standard licence agreement</apple>.",
      ],
    },
    after: [
      {
        title: "Deleting your data",
        points: [
          "Delete any remembered fact, or all of them, in Profile under What Astrya knows.",
          "Delete a conversation and its summary from your reading history.",
          "Delete your account in Profile: your chart, readings, memory and alerts are removed with it.",
        ],
      },
      {
        title: "Age",
        points: [
          "Astrya is not meant for anyone under 13 and does not knowingly collect their data. If you believe a child has an account, write to the address below and it will be deleted.",
        ],
      },
    ],
    contactTitle: "Contact",
    contact: "Questions or requests about your data: <email>{email}</email>. See also the <terms>Terms of use</terms>.",
  },
  terms: {
    title: "Terms of use",
    intro: "Last updated {date}. By using Astrya you agree to these terms and to the <privacy>Privacy policy</privacy>.",
    sections: [
      {
        title: "What Astrya is",
        points: [
          "Astrya is a free personal project. It works out your birth chart and uses an AI model to write readings from it.",
          "Readings are for entertainment and reflection. Astrology is not a science, and nothing in Astrya predicts the future with certainty.",
        ],
      },
      {
        title: "Not professional advice",
        points: [
          "Nothing in Astrya is medical, mental health, legal, financial or relationship advice. Do not make important decisions on a reading alone.",
          "If you are in crisis or thinking about harming yourself, contact your local emergency number or a crisis line now. Astrya cannot help in an emergency.",
        ],
      },
      {
        title: "AI-written readings",
        points: [
          "Readings are written by an AI model and can be wrong, incomplete or inconsistent, including about your chart. Check anything that matters.",
          "The Privacy page explains what is sent to the model and why.",
        ],
      },
      {
        title: "Your account",
        points: [
          "You must be at least 13 to use Astrya, and old enough in your country to agree to these terms and to the processing described on the Privacy page.",
          "Keep your sign-in details to yourself. You are responsible for what happens under your account.",
          "If you add someone else's birth details, for example to compare charts, only do so with their permission.",
        ],
      },
      {
        title: "Fair use",
        points: [
          "Don't use Astrya to harass anyone, to break the law, or to try to get around its limits, security or safety rules.",
          "Don't overload the service, scrape it, or use it to build a competing dataset.",
          "An account used this way may be suspended or deleted.",
        ],
      },
      {
        title: "Your content",
        points: [
          "What you write and the birth details you enter stay yours. You let Astrya store and process them only to run the app for you.",
          "You can delete them, or your whole account, from Profile at any time.",
        ],
      },
      {
        title: "No guarantees",
        points: [
          "Astrya is provided as it is and as available, without warranties of any kind, to the extent the law allows.",
          "It may change, pause or shut down at any time. Features may come and go.",
          "To the extent the law allows, the developer is not liable for any loss or damage that comes from using Astrya or relying on a reading.",
        ],
      },
      {
        title: "Apple",
        points: ["If you got Astrya from the App Store, Apple's standard licence agreement also applies to your use of the app."],
      },
      {
        title: "Changes",
        points: [
          "These terms may be updated. The date at the top changes when they do. Using Astrya after a change means you accept the new terms.",
        ],
      },
    ],
    contactTitle: "Contact",
    contact: "Questions about these terms: <email>{email}</email>. Apple's <apple>standard licence agreement</apple>.",
  },
};

export type LegalMessages = Widen<typeof legalEn>;
