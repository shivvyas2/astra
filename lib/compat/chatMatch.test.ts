import { describe, it, expect } from "vitest";
import { messagesFor } from "@/lib/i18n/dictionaries";
import type { GeoResult } from "@/lib/geo";
import { detailsLine, parseDetailsLine, readProposal, reply, resolvePlaces, CARD_SEPARATOR, splitCard } from "./chatMatch";

const place = (name: string, lat = 21.15): GeoResult => ({ name, lat, lng: 79.09, timezone: "Asia/Kolkata", country: "India" });
const NAGPUR = place("Nagpur, Maharashtra, India");
const en = messagesFor("en");
const base = {
  name: "Priya",
  relationship: "partner",
  birth_date: "1996-08-21",
  alternate_birth_date: null,
  birth_time: "14:10",
  birth_time_unknown: false,
  place: "Nagpur",
};
const find = (places: GeoResult[]) => async () => ({ places, ambiguous: false });

describe("the details line", () => {
  it("round-trips in every language", () => {
    for (const locale of ["en", "hi", "gu"] as const) {
      const d = { name: "Priya", relationship: "spouse" as const, birthDate: "1996-08-21", birthTime: "14:10", timeKnown: true, place: "Nagpur, Maharashtra, India" };
      expect(parseDetailsLine(`x\n\n${detailsLine(d, locale)}\n\ny`)).toEqual(d);
    }
  });
  it("keeps midnight, noon and an unknown time apart", () => {
    for (const birthTime of ["00:05", "12:00", "23:59"]) {
      const d = { name: "A", relationship: "other" as const, birthDate: "1990-10-05", birthTime, timeKnown: true, place: "Patan, Gujarat, India" };
      expect(parseDetailsLine(detailsLine(d, "en"))).toEqual(d);
    }
    const unknown = { name: "A", relationship: "friend" as const, birthDate: "1990-10-05", birthTime: null, timeKnown: false, place: "Patan, Gujarat, India" };
    expect(parseDetailsLine(detailsLine(unknown, "en"))).toEqual(unknown);
  });
  it("cannot be broken by a name that looks like the format", () => {
    const d = { name: "**Eve** (Spouse) · 1\n> **x**", relationship: "other" as const, birthDate: "2000-01-01", birthTime: "01:00", timeKnown: true, place: "Pune, India" };
    const parsed = parseDetailsLine(detailsLine(d, "en"));
    expect(parsed?.birthDate).toBe("2000-01-01");
    expect(parsed?.relationship).toBe("other");
  });
  it("is null for an ordinary reading", () => {
    expect(parseDetailsLine("**Marriage**\nMost likely yes.")).toBeNull();
  });
});

describe("readProposal", () => {
  it("rejects anything that is not the schema", () => {
    expect(readProposal(null)).toBeNull();
    expect(readProposal({ ...base, birth_date: 5 })).toBeNull();
  });
  it("drops an impossible or future date, a bad time, and an unknown relationship", () => {
    expect(readProposal({ ...base, birth_date: "2001-02-30" })?.birthDate).toBeNull();
    expect(readProposal({ ...base, birth_date: "2999-01-01" })?.birthDate).toBeNull();
    expect(readProposal({ ...base, birth_time: "25:00" })?.birthTime).toBeNull();
    expect(readProposal({ ...base, relationship: "nemesis" })?.relationship).toBe("other");
  });
});

describe("reply", () => {
  it("offers a card to a client that draws one, and a yes to one that cannot", async () => {
    const p = readProposal(base)!;
    const card = await reply(p, { cards: true, locale: "en", find: find([NAGPUR]) });
    expect(card.card).toMatchObject({ type: "match", name: "Priya", birthDate: "1996-08-21", birthTime: "14:10", places: [NAGPUR] });
    expect(card.text).toContain("21 Aug 1996, 2:10 PM");
    const text = await reply(p, { cards: false, locale: "en", find: find([NAGPUR]) });
    expect(text.card).toBeNull();
    expect(text.text).toContain('Reply "yes"');
    expect(parseDetailsLine(text.text)?.place).toBe(NAGPUR.name);
  });
  it("answers in the language they typed, whatever the app is set to", async () => {
    const say = async (language: string) =>
      (await reply(readProposal({ ...base, language })!, { cards: false, locale: "en", find: find([NAGPUR]) })).text;
    expect(await say("hinglish")).toContain("Kya yeh sahi hai?");
    expect(await say("gujarati")).toContain("શું આ બરાબર છે?");
    expect(await say("hindi")).toContain("क्या यह सही है?");
    for (const l of ["hinglish", "gujarati", "hindi"]) expect(parseDetailsLine(await say(l))?.relationship).toBe("partner");
    // Unrecognised: the setting.
    expect(await say("klingon")).toContain("Is this right?");
  });
  it("asks only for what is missing", async () => {
    const p = readProposal({ ...base, birth_date: null, place: null })!;
    const r = await reply(p, { cards: true, locale: "en", find: find([]) });
    expect(r.card).toBeNull();
    expect(r.text).toBe("To match your charts I still need their birth date with the year and their birthplace.");
  });
  it("does not need a time that is said to be unknown", async () => {
    const p = readProposal({ ...base, birth_time: null, birth_time_unknown: true })!;
    const r = await reply(p, { cards: false, locale: "en", find: find([NAGPUR]) });
    expect(parseDetailsLine(r.text)).toMatchObject({ timeKnown: false, birthTime: null });
  });
  it("opens an empty card when nothing was given, and asks in words without cards", async () => {
    const p = readProposal({ ...base, name: "", birth_date: null, birth_time: null, place: null })!;
    expect((await reply(p, { cards: true, locale: "en", find: find([]) })).card).toMatchObject({ birthDate: null, places: [] });
    expect((await reply(p, { cards: false, locale: "en", find: find([]) })).text).toBe(en.chat.match.askPerson);
  });
  it("makes them choose between two readings of a date, with nothing to say yes to", async () => {
    const p = readProposal({ ...base, birth_date: "2001-04-03", alternate_birth_date: "2001-03-04" })!;
    const text = await reply(p, { cards: false, locale: "en", find: find([NAGPUR]) });
    expect(text.text).toBe("Is the birth date 3 Apr 2001 or 4 Mar 2001?");
    const card = await reply(p, { cards: true, locale: "en", find: find([NAGPUR]) });
    expect(card.card).toMatchObject({ birthDate: "2001-04-03", altBirthDate: "2001-03-04" });
    expect(parseDetailsLine(card.text)).toBeNull();
  });
  it("never offers a yes for an ambiguous place on a card, and says so in words", async () => {
    const two = [place("Patan, Gujarat, India"), place("Patan, Bagmati, Nepal", 27.6)];
    const p = readProposal({ ...base, place: "Patan" })!;
    const ambiguous = async () => ({ places: two, ambiguous: true });
    const card = await reply(p, { cards: true, locale: "en", find: ambiguous });
    expect(card.card?.placeAmbiguous).toBe(true);
    expect(parseDetailsLine(card.text)).toBeNull();
    const text = await reply(p, { cards: false, locale: "en", find: ambiguous });
    expect(text.text).toContain(en.chat.match.placeOther);
  });
  it("says when a place cannot be found", async () => {
    const r = await reply(readProposal({ ...base, place: "Xyzzy" })!, { cards: true, locale: "en", find: find([]) });
    expect(r.card).toBeNull();
    expect(r.text).toContain("Xyzzy");
  });
});

describe("resolvePlaces", () => {
  it("falls back to the town and ranks by the rest", async () => {
    const seen: string[] = [];
    const geocode = async (q: string) => {
      seen.push(q);
      return q === "Patan" ? [place("Patan, Bagmati, Nepal", 27.6), place("Patan, Gujarat, India")] : [];
    };
    const r = await resolvePlaces("Patan Gujarat", geocode);
    expect(seen).toEqual(["Patan Gujarat", "Patan"]);
    expect(r.places[0].name).toBe("Patan, Gujarat, India");
    expect(r.ambiguous).toBe(false);
  });
  it("is ambiguous when nothing tells two places apart", async () => {
    const r = await resolvePlaces("Patan", async () => [place("Patan, Bagmati, Nepal", 27.6), place("Patan, Gujarat, India")]);
    expect(r.ambiguous).toBe(true);
  });
  it("is empty, not thrown, when the lookup fails", async () => {
    expect(await resolvePlaces("Pune", async () => { throw new Error("down"); })).toEqual({ places: [], ambiguous: false });
  });
});

describe("splitCard", () => {
  it("separates a card from its text, and survives a half-arrived or broken one", () => {
    expect(splitCard("hello")).toEqual({ text: "hello", card: null });
    expect(splitCard(`hi${CARD_SEPARATOR}{"type":"ma`)).toEqual({ text: "hi", card: null });
    const r = splitCard(`hi${CARD_SEPARATOR}{"type":"match","name":"P","relationship":"partner","birthDate":null,"altBirthDate":null,"birthTime":null,"timeKnown":true,"places":[],"placeAmbiguous":false}`);
    expect(r.text).toBe("hi");
    expect(r.card?.name).toBe("P");
  });
});
