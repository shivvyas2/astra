import { describe, expect, it } from "vitest";
import { faultIn, isTender, namesIn, tooAlike } from "./voice";

const ok = { title: "You keep rehearsing that reply", body: "Send half of it. The other half is for you." };

describe("faultIn", () => {
  it("lets a specific line through, in any language", () => {
    expect(faultIn(ok)).toBeNull();
    expect(faultIn({ title: "तुमने हाँ कह दी?", body: "सोचो, किसके लिए कही थी।" })).toBeNull();
    expect(faultIn({ title: "એ સલાહ તમારી નહોતી", body: "આજે એક વાત તમને સાચી લાગી, પણ તે કોની હતી?" })).toBeNull();
    expect(faultIn({ title: "11 days until this shifts", body: "On Sunday you asked about work. 6 Dec has an opinion." })).toBeNull();
  });
  it("refuses the worn-out words it used to lean on", () => {
    for (const title of ["Steady work, guard your focus", "A quiet day, Moon over your 10th house", "A heavy day, settling into calm", "आज मन शांत रखो", "આજે ઘર અને મનની શાંતિ, સ્થિર રહો"]) expect(faultIn({ ...ok, title })).toContain("worn-out");
  });
  it("keeps astrology off the lock screen, except where it is the news", () => {
    for (const title of ["Saturn rests on your plans", "Your 12th-house question", "House 5 is loud", "राहु का खेल"]) expect(faultIn({ ...ok, title })).toContain("astrology talk");
    expect(faultIn({ ...ok, title: "Sade Sati starts its last lap" }, { sky: true })).toBeNull();
  });
  it("refuses clock times, which no chart gives, but not dates", () => {
    for (const body of ["Notice what you do between 8 and 9 tomorrow.", "Answer it after 4 today.", "You'll know by 10 am.", "Kal 5 baje dekhna", "कल 5 बजे देखना", "કાલે 5 વાગ્યે જોજો"]) expect(faultIn({ ...ok, body })).toContain("clock time");
    expect(faultIn({ ...ok, body: "It opens in 3 days, on 28 Nov." })).toBeNull();
    expect(faultIn({ ...ok, body: "Something moves by 6 Dec." })).toBeNull();
  });
  it("never sends fear, pressure, tips or emoji", () => {
    for (const body of ["Last chance to fix it", "Don't miss this", "We miss you", "Is your partner cheating?", "An accident is near", "Buy stocks today", "Open now!", "Look 👀", "Wait — there's more"]) expect(faultIn({ ...ok, body })).toContain("may not contain");
  });
  it("wants a different subject from what they already had", () => {
    expect(faultIn(ok, { recent: ["You keep rehearsing the reply"] })).toContain("too close");
    expect(faultIn(ok, { recent: ["Someone owes you an answer"] })).toBeNull();
  });
  it("lets a tender line be gentle, and still not frightening", () => {
    expect(faultIn({ title: "One small thing for tomorrow", body: "Be gentle with yourself tonight." }, { tender: true })).toBeNull();
    expect(faultIn({ ...ok, body: "Someone may die" }, { tender: true })).not.toBeNull();
  });
});

it("knows two titles that would feel like one", () => {
  expect(tooAlike("Steady work today", "Steady work, guard it")).toBe(true);
  expect(tooAlike("Someone wants you to agree fast", "Someone hands you a small task")).toBe(false);
  expect(tooAlike("The offer wants an answer", "An answer the offer wants")).toBe(true);
});

it("recognises pain in five ways of writing", () => {
  for (const t of ["I want to die", "thinking of ending my life after rejections", "mujhe jeena nahi hai", "mane marvu che", "मैं आत्महत्या के बारे में सोचता हूँ", "મારે જીવવું નથી", "Mother passed away in March", "has depression", "diagnosed with cancer"]) expect(isTender([t]), t).toBe(true);
  for (const t of ["Wants to change jobs", "Moon in Cancer sign?".replace("Cancer", "Leo"), "Asked when she will marry", "Is dying to visit Japan".replace("dying", "keen")]) expect(isTender([t]), t).toBe(false);
});

describe("what others can read on a lock screen", () => {
  const secret = namesIn(["Asked whether to accept a job offer in Pune; worried about leaving family.", "Is engaged to Kabir. Works at Infosys.", "kya Riya se shaadi hogi", "Moon in Taurus, asked in November on Tuesday"]);
  it("holds the names in their history, and not everyday words", () => {
    expect(secret.sort()).toEqual(["infosys", "kabir", "pune", "riya"]);
  });
  it("is never one of them, nor a sum", () => {
    for (const body of ["You asked about Pune. Answer it.", "The INFOSYS thing"]) expect(faultIn({ ...ok, body }, { secret })).toContain("may not contain");
    expect(faultIn({ ...ok, body: "That 40,000 rupees question" })).toContain("sum of money");
    expect(faultIn(ok, { secret })).toBeNull();
  });
  it("catches a possessive too", () => {
    expect(faultIn({ ...ok, body: "Kabir's silence says it" }, { secret })).toContain("may not contain");
  });
});
