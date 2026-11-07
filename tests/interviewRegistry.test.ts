// The interview as data, and the rules it has to obey (I2 of
// docs/PLAN-AUTO-INTERVIEW.md).
//
// WHY THIS FILE IS THE POINT OF I2. The question set used to be a
// document a person read out in a meeting. As a registry it can be
// CHECKED: that no prompt names a trade, that no question assumes a way
// of trading the business does not have, that every answer has a
// declared destination, and that a half-finished interview reports
// itself as half-finished.
//
// THE RULE THAT MATTERS MOST HERE IS CLAUDE.md RULE 3, in both its
// halves. tests/multiTenantVocabulary.test.ts already sweeps every
// source file for one business's words and would catch a prompt naming
// a category. What it cannot catch is the other half, which
// tests/multiTenantRender.test.ts records: a prompt can be
// category-neutral in its WORDS and still assume a physical product
// nobody ships. "How many days does delivery take" is meaningless to a
// coaching centre, and asking it is what makes a product feel like it
// was built for somebody else.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { sourceWithComments } from "./helpers/source";

import {
  INTERVIEW_QUESTIONS,
  KNOWLEDGE_CATEGORIES,
  isComplete,
  nextQuestion,
  progressFor,
  questionByKey,
  questionsFor,
} from "@/lib/onboarding/interview";
import { OFFER_PROMISES } from "@/lib/claims/offerPromises";
import { BUSINESS_MODELS } from "@/lib/business/businessModel";

/** Every word that belongs to one business, from multiTenantVocabulary's own families. */
const ONE_BUSINESSES_WORDS: RegExp[] = [
  /\btest[ _-]?drives?\b/i,
  /\bshowroom\b/i,
  /\bdealership\b/i,
  /\bcandles?\b/i,
  /\bsoy\s+wax\b/i,
  /\bbeeswax\b/i,
  /\blavender\b/i,
  /\bmithai\b/i,
  /\bkaju\s+katli\b/i,
  /\bladdu\b/i,
  /\bbarfi\b/i,
  /\bsarees?\b/i,
  /\blehenga\b/i,
  /\bkurtis?\b/i,
  /\bcoaching\s+(?:batch|centre|center)\b/i,
  /\btuition\b/i,
];

const allText = (q: { prompt: string; help?: string }) => `${q.prompt} ${q.help ?? ""}`;

// ---------------------------------------------------------------------
describe("1. NO PROMPT BELONGS TO ONE BUSINESS", () => {
  it("NOT ONE QUESTION NAMES A TRADE, A PRODUCT OR A CATEGORY", () => {
    const leaks: string[] = [];
    for (const q of INTERVIEW_QUESTIONS) {
      for (const word of ONE_BUSINESSES_WORDS) {
        if (word.test(allText(q))) leaks.push(`${q.key}: ${word}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("AND NO PROMPT NAMES A UNIT OF ONE TRADE EITHER", () => {
    // The subtler half. "How many jars", "how many plates", "per batch"
    // are all category-neutral words that assume one kind of thing.
    for (const q of INTERVIEW_QUESTIONS) {
      expect(allText(q)).not.toMatch(/\b(jars?|plates?|bottles?|packets?|per\s+batch|per\s+piece)\b/i);
    }
  });

  it("every prompt is a question, so none of them is an instruction in disguise", () => {
    for (const q of INTERVIEW_QUESTIONS) expect(q.prompt.trim()).toMatch(/\?/);
  });
});

// ---------------------------------------------------------------------
describe("2. A QUESTION THAT ASSUMES A WAY OF TRADING IS GATED ON IT", () => {
  it("A BUSINESS THAT SELLS NOTHING PHYSICAL IS NEVER ASKED ABOUT DELIVERY", () => {
    const asked = questionsFor(2, { models: ["services"] }).map((q) => q.key);
    expect(asked).not.toContain("delivery_time");
    expect(asked).not.toContain("damaged_in_transit");
    expect(asked).not.toContain("ready_or_made");
  });

  it("AND ONE THAT SELLS NOTHING ELSE IS NEVER ASKED ABOUT APPOINTMENTS", () => {
    const asked = questionsFor(2, { models: ["products"] }).map((q) => q.key);
    expect(asked).toContain("delivery_time");
    expect(asked).not.toContain("appointment_length");
  });

  it("A BUSINESS THAT DOES BOTH IS ASKED BOTH", () => {
    const asked = questionsFor(2, { models: ["products", "services"] }).map((q) => q.key);
    expect(asked).toContain("delivery_time");
    expect(asked).toContain("appointment_length");
  });

  it("AND ONE THAT HAS SAID NOTHING YET IS ASKED NEITHER, not both", () => {
    // Empty models means nobody has answered, which is not the same as
    // "every way of trading". Asking a business about delivery AND
    // appointments because we do not know is how a product feels like
    // it was built for somebody else.
    const asked = questionsFor(2, {}).map((q) => q.key);
    expect(asked).not.toContain("delivery_time");
    expect(asked).not.toContain("appointment_length");
  });

  it("THE QUESTIONS EVERY BUSINESS GETS ARE ASKED WHATEVER IT SELLS", () => {
    // These four have no gate, and must not acquire one: a reply time,
    // a reason to choose you, a returns policy and what you work with
    // are questions for a sweet shop and a coaching centre alike.
    for (const models of [[], ["products"], ["services"], ["subscription"], ["b2b"]] as any[]) {
      const asked = questionsFor(2, { models }).map((q) => q.key);
      expect(asked).toContain("enquiry_response");
      expect(asked).toContain("why_not_cheaper");
      expect(asked).toContain("returns_policy");
      expect(asked).toContain("materials_used");
    }
  });

  it("every gate names a real business model", () => {
    const src = readFileSync("src/lib/onboarding/interview.ts", "utf8");
    for (const model of src.match(/includes\("([a-z0-9_]+)"\)/g) ?? []) {
      const name = model.replace(/.*\("|"\).*/g, "");
      expect(BUSINESS_MODELS as readonly string[]).toContain(name);
    }
  });

  it("TIER 1 IS NEVER GATED — every business has a phone, hours and an address", () => {
    // Same correction: a gated tier-1 question is absent from
    // questionsFor(1, {}), so iterating that list could never find one.
    for (const q of INTERVIEW_QUESTIONS.filter((q) => q.tier === 1)) expect(q.when).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
describe("3. FOUR QUESTIONS IN ONBOARDING, AND THEY ARE THE BORING ONES", () => {
  it("TIER 1 IS EXACTLY THE FOUR THE FOUNDER APPROVED", () => {
    // Four, not thirteen: onboarding is already ten steps, and nobody
    // finishes a twenty-three-step wizard. Approved 7 November 2026.
    //
    // READ OFF THE REGISTRY, NOT OFF questionsFor(). Two mutations got
    // through the first version of this test, which asked
    // questionsFor(1, {}): a fifth question moved into tier 1 but gated
    // on a way of trading was FILTERED OUT of that answer, so the
    // assertion saw the same four and passed. The filtered list cannot
    // be used to prove what the flow contains.
    expect(INTERVIEW_QUESTIONS.filter((q) => q.tier === 1).map((q) => q.key)).toEqual([
      "public_phone",
      "opening_hours",
      "areas_served",
      "street_address",
    ]);
    // And the unfiltered and filtered lists must agree, which is the
    // other half of the same statement: nothing in tier 1 is gated.
    expect(questionsFor(1, {}).map((q) => q.key)).toEqual(
      INTERVIEW_QUESTIONS.filter((q) => q.tier === 1).map((q) => q.key)
    );
  });

  it("NOT ONE OF THEM NEEDS A JUDGMENT, so none needs the falsifiability check", () => {
    // A phone number is not vague. These are facts the owner knows at
    // minute one, which is the whole reason they are the ones in
    // onboarding.
    for (const q of questionsFor(1, {})) expect(q.needsFalsifiable).toBe(false);
  });

  it("AND EVERY ONE OF THEM WRITES TO THE LISTING TABLE", () => {
    for (const q of questionsFor(1, {})) {
      expect(q.writesTo.table).toBe("business_listing_facts");
    }
  });

  it("THE TWO WITH A PRIVACY CONSEQUENCE CARRY A PUBLISH DECISION", () => {
    // Migration 221's shape: a value Hawlai knows is not a value the
    // owner asked to publish.
    const byKey = Object.fromEntries(questionsFor(1, {}).map((q) => [q.key, q]));
    expect((byKey.public_phone.writesTo as any).publishColumn).toBe("publish_phone");
    expect((byKey.street_address.writesTo as any).publishColumn).toBe("publish_street_address");
  });

  it("and the publish question is asked in the prompt, not assumed", () => {
    expect(questionByKey("public_phone")!.help).toMatch(/you decide separately whether it appears/i);
    expect(questionByKey("street_address")!.prompt).toMatch(/do you want the street address shown publicly/i);
  });
});

// ---------------------------------------------------------------------
describe("4. THE NINE PROMISES ARE THE NINE THE REVIEW WATCHES FOR", () => {
  it("ONE QUESTION PER PROMISE, DERIVED, NOT RETYPED", () => {
    // Asking about a DIFFERENT nine would be worse than not asking: the
    // interview would collect answers nobody checks, and the review
    // would keep flagging promises nobody was asked about.
    const promiseKeys = INTERVIEW_QUESTIONS.filter((q) => q.key.startsWith("promise_")).map((q) => q.key);
    expect(promiseKeys).toEqual(OFFER_PROMISES.map((p) => `promise_${p.key}`));
    expect(promiseKeys.length).toBe(9);
  });

  it("A TENTH PROMISE WOULD BE ASKED ABOUT AUTOMATICALLY", () => {
    // The registry maps over the list rather than listing the nine, so
    // the two cannot drift. Asserted on the source, because the
    // behaviour is the absence of a second list.
    const src = readFileSync("src/lib/onboarding/interview.ts", "utf8");
    expect(src).toMatch(/OFFER_PROMISES\.map\(\(promise\) => \(\{/);
  });

  it("AND THE REVIEW READS THE SAME LIST, not a copy of it", () => {
    const review = readFileSync("src/lib/claims/siteClaimsReview.ts", "utf8");
    expect(review).toMatch(/import \{ OFFER_PROMISES \} from "\.\/offerPromises"/);
    expect(review).toMatch(/const OFFER_PATTERNS = OFFER_PROMISES;/);
    // The literal list must be gone, not shadowed by a second one.
    expect(review).not.toMatch(/OFFER_PATTERNS: \{ pattern: RegExp; name: string \}\[\] = \[/);
  });

  it("every promise question is a yes or no, because a 'no' is the useful half", () => {
    // An absence ON record is a promise the guard can refuse; an absence
    // OF a record is a gap a generator fills.
    for (const q of INTERVIEW_QUESTIONS.filter((q) => q.key.startsWith("promise_"))) {
      expect(q.kind).toBe("yes_no");
      expect(q.needsFalsifiable).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------
describe("5. EVERY ANSWER HAS SOMEWHERE REAL TO GO", () => {
  it("EVERY KNOWLEDGE CATEGORY IS ONE THE LIVE CHECK ACCEPTS", () => {
    // migration 189 widened business_knowledge.category to six values.
    // A seventh would fail the insert at the worst possible moment.
    for (const q of INTERVIEW_QUESTIONS) {
      if (q.writesTo.table !== "business_knowledge") continue;
      expect(KNOWLEDGE_CATEGORIES as readonly string[]).toContain(q.writesTo.category);
    }
  });

  it("AND THE SIX ARE THE SIX THE MIGRATION NAMES", () => {
    const m = readFileSync("supabase/migrations/189_business_story_category.sql", "utf8");
    for (const category of KNOWLEDGE_CATEGORIES) expect(m).toContain(`'${category}'`);
  });

  it("EVERY LISTING COLUMN IS A COLUMN MIGRATION 221 CREATES", () => {
    const m = readFileSync("supabase/migrations/221_business_listing_facts.sql", "utf8");
    for (const q of INTERVIEW_QUESTIONS) {
      if (q.writesTo.table !== "business_listing_facts") continue;
      expect(m).toMatch(new RegExp(`^\\s*${q.writesTo.column}\\s`, "m"));
      if (q.writesTo.publishColumn) {
        expect(m).toMatch(new RegExp(`^\\s*${q.writesTo.publishColumn}\\s`, "m"));
      }
    }
  });

  it("NO ANSWER IS WRITTEN ANYWHERE ELSE", () => {
    // Two destinations, both of them tables the facts layer already
    // reads. A third would be a fact nothing can see.
    for (const q of INTERVIEW_QUESTIONS) {
      expect(["business_listing_facts", "business_knowledge"]).toContain(q.writesTo.table);
    }
  });

  it("a knowledge row's title is stable, so re-answering updates rather than duplicates", () => {
    const titles = INTERVIEW_QUESTIONS.filter((q) => q.writesTo.table === "business_knowledge").map(
      (q) => (q.writesTo as any).title
    );
    expect(new Set(titles).size).toBe(titles.length);
    for (const title of titles) expect(title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------
describe("6. A HALF-FINISHED INTERVIEW REPORTS ITSELF AS HALF-FINISHED", () => {
  // THE EXPENSIVE FAILURE THIS PREVENTS: a half-filled record looks
  // complete to a generator, because knownText reads what is there and
  // cannot know what the owner never reached.
  const ctx = { models: ["products"] as any, answered: ["public_phone", "opening_hours"] };

  it("THE TOTAL IS DERIVED, never a literal", () => {
    const src = readFileSync("src/lib/onboarding/interview.ts", "utf8");
    expect(src).toMatch(/total: questions\.length/);
  });

  it("AND IT COUNTS ONLY THE QUESTIONS THIS BUSINESS IS ASKED", () => {
    // A services business is asked fewer tier-2 questions, so its total
    // is smaller — a fixed total would report it as permanently behind.
    const products = progressFor(2, { models: ["products"] }).total;
    const services = progressFor(2, { models: ["services"] }).total;
    const both = progressFor(2, { models: ["products", "services"] }).total;
    expect(both).toBeGreaterThan(products);
    expect(both).toBeGreaterThan(services);
  });

  it("TWO OF FOUR IS REPORTED AS TWO OF FOUR", () => {
    expect(progressFor(1, ctx)).toEqual({ answered: 2, total: 4 });
    expect(isComplete(1, ctx)).toBe(false);
  });

  it("AN UNANSWERED INTERVIEW IS NOT COMPLETE", () => {
    expect(isComplete(1, {})).toBe(false);
    expect(isComplete(2, { models: [] as any, answered: [] })).toBe(false);
  });

  it("EVERY TIER ALWAYS HAS AT LEAST ONE QUESTION, whatever the business sells", () => {
    // WHY THIS IS THE ASSERTION AND NOT A total === 0 CASE. isComplete
    // reads `total > 0 && answered === total`. A mutation removing
    // `total > 0` survived, and it survived for a true reason: there is
    // no way through the public API to reach a tier with no questions,
    // because tier 1 is never gated and tier 2 always keeps its ungated
    // questions. The branch is correct and stays — it is what makes a
    // future all-gated tier safe rather than silently "complete" — and
    // what is testable is the invariant that makes it unreachable.
    //
    // Reported as an unreachable defensive branch rather than as a
    // killed mutant, because it is not one.
    for (const models of [[], ["products"], ["services"], ["subscription"], ["b2b"], ["products", "services"]] as any[]) {
      expect(progressFor(1, { models }).total).toBeGreaterThan(0);
      expect(progressFor(2, { models }).total).toBeGreaterThan(0);
    }
  });

  it("and a finished tier is finished", () => {
    const all = questionsFor(1, {}).map((q) => q.key);
    expect(isComplete(1, { answered: all })).toBe(true);
    expect(progressFor(1, { answered: all })).toEqual({ answered: 4, total: 4 });
  });
});

// ---------------------------------------------------------------------
describe("7. THE NEXT QUESTION IS THE NEXT UNANSWERED ONE", () => {
  it("TIER 1 COMES BEFORE TIER 2, because tier 1 is in onboarding", () => {
    expect(nextQuestion({ models: ["products"] })!.key).toBe("public_phone");
  });

  it("AND AN ANSWERED QUESTION IS NOT ASKED AGAIN", () => {
    // The founder's decision of 7 November: a fact is asked for once,
    // ever. A product that asks the same question every week is a
    // product the owner stops reading.
    const next = nextQuestion({ models: ["products"], answered: ["public_phone", "opening_hours", "areas_served", "street_address"] });
    expect(next!.tier).toBe(2);
    expect(next!.key).toBe("delivery_time");
  });

  it("A GATED-OUT QUESTION IS NEVER THE NEXT ONE", () => {
    const next = nextQuestion({
      models: ["services"],
      answered: ["public_phone", "opening_hours", "areas_served", "street_address"],
    });
    expect(next!.key).not.toBe("delivery_time");
  });

  it("AND WHEN EVERYTHING IS ANSWERED THERE IS NO NEXT QUESTION", () => {
    const ctx = { models: ["products", "services"] as any };
    const all = [...questionsFor(1, ctx), ...questionsFor(2, ctx)].map((q) => q.key);
    expect(nextQuestion({ ...ctx, answered: all })).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("8. THE KEYS ARE STABLE AND THE REGISTRY IS PURE", () => {
  it("EVERY KEY IS UNIQUE", () => {
    const keys = INTERVIEW_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("AND A KEY NOBODY DECLARED RETURNS null, never a guess", () => {
    expect(questionByKey("not_a_question")).toBeNull();
    expect(questionByKey("")).toBeNull();
  });

  it("THE REGISTRY RECORDS WHY A KEY MAY NEVER BE RENAMED", () => {
    // It is the "asked once, ever" record's key, so renaming one
    // re-asks a question the owner has already answered.
    //
    // sourceWithComments(), because the comment IS the assertion here —
    // rule 8's documented helper — and the phrase is one that fits on a
    // single line. A regex spanning a wrapped comment breaks on a
    // reflow, which is how the first version of this test failed.
    const src = sourceWithComments("src/lib/onboarding/interview.ts");
    expect(src).toMatch(/so renaming one re-asks a question the/);
  });

  it("PURE — no database, no model, no React", () => {
    const src = sourceWithComments("src/lib/onboarding/interview.ts");
    expect(src).not.toMatch(/^import .*supabase/m);
    expect(src).not.toMatch(/^import .*(claude|anthropic)/mi);
    expect(src).not.toMatch(/^import .*react/mi);
    // And the shared promise list is pure too, or importing it from a
    // client component would pull the facts layer into the bundle.
    const promises = sourceWithComments("src/lib/claims/offerPromises.ts");
    expect(promises).not.toMatch(/^import /m);
  });

  it("THE FALSIFIABILITY FLAG IS SET ON THE ANSWERS THAT ARE WRITTEN FROM", () => {
    // I3 reads this flag. The question it exists for is why_not_cheaper:
    // "best quality" is an adjective that any generator will strip,
    // while a number, a material or a duration survives.
    expect(questionByKey("why_not_cheaper")!.needsFalsifiable).toBe(true);
    expect(questionByKey("materials_used")!.needsFalsifiable).toBe(true);
    expect(questionByKey("delivery_time")!.needsFalsifiable).toBe(true);
    // And NOT on a question whose answer is a value or a yes/no.
    expect(questionByKey("public_phone")!.needsFalsifiable).toBe(false);
    expect(questionByKey("certifications")!.needsFalsifiable).toBe(false);
  });

  it("and 'none' is invited as an answer where an absence is the fact", () => {
    // With nothing on record, a generator that wants to sound credible
    // reaches for a plausible certification. With "none" on record, it
    // cannot.
    expect(questionByKey("certifications")!.prompt).toMatch(/if you have none, say none/i);
  });
});
