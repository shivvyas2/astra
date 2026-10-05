import { describe, it, expect } from "vitest";
import { parseFactChanges, planFactWrites, cleanFact, isDuplicateFact, worthReading, FACT_CHANGES_SCHEMA } from "./extract";
import type { UserFact } from "./types";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function fact(id: string, text: string, category: UserFact["category"] = "work", updated = "2026-06-01T00:00:00Z"): UserFact {
  return { id, fact: text, category, created_at: updated, updated_at: updated };
}

describe("parseFactChanges", () => {
  const ids = new Set([ID_A]);

  it("keeps valid items and drops invalid ones individually", () => {
    const out = parseFactChanges(
      {
        add: [
          { fact: "Works as a nurse in Pune.", category: "work" },
          { fact: "Hi", category: "work" }, // too short
          { fact: "Likes tea", category: "hobbies" }, // unknown category
          { fact: 42, category: "other" },
          { fact: "x".repeat(281), category: "other" }, // over the column limit
        ],
        update: [
          { id: ID_A, fact: "Married since March 2026" },
          { id: ID_B, fact: "Not one of theirs" },
        ],
        remove: [ID_A, ID_B, ID_A, 7],
      },
      ids,
    );
    expect(out).toEqual({
      add: [{ fact: "Works as a nurse in Pune", category: "work", confidence: "stated" }],
      update: [{ id: ID_A, fact: "Married since March 2026" }],
      remove: [ID_A],
    });
  });

  it("yields nothing for a reply that is not the expected object", () => {
    const empty = { add: [], update: [], remove: [] };
    expect(parseFactChanges(null, ids)).toEqual(empty);
    expect(parseFactChanges("add everything", ids)).toEqual(empty);
    expect(parseFactChanges([{ fact: "Works as a nurse" }], ids)).toEqual(empty);
    expect(parseFactChanges({ add: "nope" }, ids)).toEqual(empty);
  });

  it("refuses anything that came from a chart rather than their life", () => {
    expect(cleanFact("Saturn is transiting the 10th house")).toBeNull();
    expect(cleanFact("In Venus mahadasha until 2030")).toBeNull();
    expect(cleanFact("Is manglik")).toBeNull();
    // A house you live in is not a house in a chart.
    expect(cleanFact("Bought a house in Pune in 2025")).toBe("Bought a house in Pune in 2025");
  });

  it("matches the schema the model is constrained to", () => {
    expect(FACT_CHANGES_SCHEMA.required).toEqual(["add", "update", "remove"]);
    expect(FACT_CHANGES_SCHEMA.properties.add.items.properties.category.enum).toContain("worries");
  });
});

describe("planFactWrites", () => {
  it("drops adds that repeat what is already known, in near-same words", () => {
    const existing = [fact(ID_A, "Works as a nurse in Pune")];
    const plan = planFactWrites(existing, {
      add: [
        { fact: "works as a nurse in Pune!", category: "work" },
        { fact: "Engaged since June 2026", category: "relationships" },
        { fact: "Engaged since June 2026.", category: "relationships" },
      ],
      update: [],
      remove: [],
    });
    expect(plan.inserts).toEqual([{ fact: "Engaged since June 2026", category: "relationships" }]);
    // Said again, so it is confirmed rather than added.
    expect(plan.confirms).toEqual([ID_A]);
  });

  it("drops updates that change nothing and ignores unknown ids", () => {
    const existing = [fact(ID_A, "Engaged since June 2026", "relationships")];
    const plan = planFactWrites(existing, {
      add: [],
      update: [
        { id: ID_A, fact: "engaged since june 2026" },
        { id: ID_B, fact: "Something else" },
      ],
      remove: [ID_B],
    });
    expect(plan).toEqual({ inserts: [], updates: [], deletes: [], confirms: [] });
  });

  it("caps the list by evicting the oldest 'other' first, then the oldest overall", () => {
    const existing: UserFact[] = [];
    for (let i = 0; i < 40; i++) {
      const day = String(10 + (i % 18)).padStart(2, "0");
      existing.push(fact(`id-${i}`, `Distinct fact number ${i} about life`, i < 2 ? "other" : "work", `2026-0${1 + (i % 9)}-${day}T00:00:00Z`));
    }
    // Make id-0 (other) the newest and id-39 (work) the oldest of all.
    existing[0].updated_at = "2026-12-31T00:00:00Z";
    existing[39].updated_at = "2025-01-01T00:00:00Z";

    const plan = planFactWrites(existing, {
      add: [
        { fact: "Wants to move abroad in 2027", category: "goals" },
        { fact: "Worried about father's health", category: "worries" },
        { fact: "Has a younger sister", category: "family" },
      ],
      update: [],
      remove: [],
    });
    expect(plan.inserts).toHaveLength(3);
    // Both "other" facts go first, however new; then the oldest overall.
    expect(plan.deletes).toEqual(["id-1", "id-0", "id-39"]);
    expect(existing.length - plan.deletes.length + plan.inserts.length).toBe(40);
  });

  it("never evicts a fact this pass just updated", () => {
    const existing = [fact(ID_A, "Engaged", "other", "2020-01-01T00:00:00Z"), fact(ID_B, "Works in sales", "work")];
    const plan = planFactWrites(
      existing,
      { add: [{ fact: "Lives in Mumbai", category: "home" }], update: [{ id: ID_A, fact: "Married since March 2026" }], remove: [] },
      2,
    );
    expect(plan.deletes).toEqual([ID_B]);
    expect(plan.updates).toEqual([{ id: ID_A, fact: "Married since March 2026" }]);
  });

  it("isDuplicateFact tolerates punctuation and case but not a different fact", () => {
    expect(isDuplicateFact("Lives in Pune.", "lives in pune")).toBe(true);
    expect(isDuplicateFact("Lives in Pune", "Lives in Mumbai")).toBe(false);
  });
});

describe("worthReading", () => {
  it("skips chart questions that say nothing about their life", () => {
    expect(worthReading("What does Saturn in the 10th mean?")).toBe(false);
    expect(worthReading("ok")).toBe(false);
  });
  it("reads first-person messages, and short answers to a question we asked", () => {
    expect(worthReading("I'm a nurse in Pune and I want to move abroad")).toBe(true);
    expect(worthReading("Yes, since June", "Are you engaged yet?")).toBe(true);
  });
});

describe("fact confidence", () => {
  it("keeps 'inferred' and reads anything else as 'stated'", () => {
    const out = parseFactChanges(
      {
        add: [
          { fact: "Married", category: "relationships", confidence: "inferred" },
          { fact: "Lives in Pune", category: "home", confidence: "certain" },
        ],
      },
      new Set(),
    );
    expect(out.add.map((a) => a.confidence)).toEqual(["inferred", "stated"]);
  });
});
