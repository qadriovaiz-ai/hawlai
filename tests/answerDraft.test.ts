// The answer, in the owner's own words or not at all — A6-b/A6-c.
//
// ──────────────────────────────────────────────────────────────────
// NOTHING IS GENERATED, AND THAT IS THE FINDING.
//
// A3 and A6-c were both sized as "answers written from the business's
// own facts, through the C2 door" — a generator with a claims guard in
// front. Reading the interview showed that is not necessary: the
// answer to "what is your delivery time" is ALREADY STORED as the
// sentence the owner typed, because saveInterviewAnswer writes it to
// business_knowledge under a stable title the question itself carries
// in `writesTo`.
//
// So there is no model call, no cost, and no invented answer to guard
// against. The difference between "the risk is managed" and "the risk
// is not present".
//
// THE THREE RULES THIS FILE HOLDS:
//
//   1. A COMPLIANCE ANSWER IS NEVER PUBLIC. `internalOnly` means a
//      declaration ad platforms need and no customer should read back.
//   2. KNOWING IS NOT PERMISSION TO PRINT. For listing facts, the
//      owner's publish decision is a SEPARATE column, and an FAQ
//      answer is as public as a page gets.
//   3. A SEARCH TERM HAS NO ANSWER. There is no interview question
//      behind a phrase somebody typed into Google, so there is nothing
//      stored — and pretending otherwise is how a generator gets
//      invited back in.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { draftAnswer, draftAnswers, draftSummary, MIN_ANSWER } from "@/lib/seo/answerDraft";
import { INTERVIEW_QUESTIONS, questionByKey } from "@/lib/onboarding/interview";
import { code, sourceWithComments } from "./helpers/source";

const knowledgeQuestion = (over: Record<string, any> = {}) =>
  ({
    key: "delivery_time",
    tier: 2,
    prompt: "How long does delivery take?",
    kind: "text",
    needsFalsifiable: true,
    writesTo: { table: "business_knowledge", category: "operations", title: "Delivery time", ...(over.writesTo ?? {}) },
    ...over,
  }) as any;

const listingQuestion = (over: Record<string, any> = {}) =>
  ({
    key: "public_phone",
    tier: 1,
    prompt: "What number should a customer call you on?",
    kind: "phone",
    needsFalsifiable: false,
    writesTo: { table: "business_listing_facts", column: "public_phone", publishColumn: "publish_phone", ...(over.writesTo ?? {}) },
    ...over,
  }) as any;

const note = (over: Record<string, any> = {}) => ({
  title: "Delivery time",
  content: "Orders inside the city reach you in two days, and outside in four.",
  is_weak: false,
  is_active: true,
  ...over,
});

describe("1. THE ANSWER IS HIS OWN SENTENCE", () => {
  it("IT COMES BACK WORD FOR WORD, from the row the question names", () => {
    // THE LOAD-BEARING ONE. Nothing writes this answer: the question's
    // `writesTo.title` is the same title saveInterviewAnswer stored it
    // under, so this is a lookup.
    const out = draftAnswer(knowledgeQuestion(), [note()], null);
    expect(out.ok).toBe(true);
    expect((out as any).answer).toBe("Orders inside the city reach you in two days, and outside in four.");
  });

  it("THE TITLE MATCH IGNORES CASE AND SPACING, because he can edit it by hand", () => {
    // business_knowledge is the OWNER'S table, hand-editable through
    // the Business Knowledge page — saveAnswer's own comment says so.
    expect(draftAnswer(knowledgeQuestion(), [note({ title: "  delivery TIME " })], null).ok).toBe(true);
  });

  it("A THIN ANSWER STILL COMES BACK, FLAGGED", () => {
    // `is_weak` travels with the text by design. Hiding a thin answer
    // would leave the question unanswerable; sending it unflagged would
    // put his weakest wording on a public page without saying so.
    const out = draftAnswer(knowledgeQuestion(), [note({ is_weak: true })], null);
    expect(out.ok).toBe(true);
    expect((out as any).weak).toBe(true);
  });

  it("NO ROW MEANS NO ANSWER, and says what he would have to do", () => {
    const out = draftAnswer(knowledgeQuestion(), [], null);
    expect(out.ok).toBe(false);
    expect((out as any).why).toMatch(/haven't told Hawlai/);
  });

  it("AND AN INACTIVE ROW IS NOT AN ANSWER", () => {
    // He switched it off on the Business Knowledge page. That is a
    // decision, not an oversight.
    expect(draftAnswer(knowledgeQuestion(), [note({ is_active: false })], null).ok).toBe(false);
  });

  it("too short to answer with is refused rather than published", () => {
    expect(draftAnswer(knowledgeQuestion(), [note({ content: "Two days" })], null).ok).toBe(false);
    expect(MIN_ANSWER).toBeGreaterThan(5);
  });
});

describe("2. A COMPLIANCE ANSWER IS NEVER AN FAQ ANSWER", () => {
  it("internalOnly IS REFUSED, whatever is on the row", () => {
    // Migration 229: "this business advertises housing" is a
    // declaration Meta needs and no customer should ever read back.
    const q = knowledgeQuestion({ writesTo: { table: "business_knowledge", category: "operations", title: "Delivery time", internalOnly: true } });
    const out = draftAnswer(q, [note()], null);
    expect(out.ok).toBe(false);
    expect((out as any).why).toMatch(/declaration for ad platforms/);
  });

  it("AND IT IS CHECKED BEFORE THE ROW IS EVEN LOOKED FOR", () => {
    // So a later reader cannot reorder this and leak one by accident.
    const s = code("src/lib/seo/answerDraft.ts");
    const at = s.indexOf('if (dest.table === "business_knowledge")');
    const internal = s.indexOf("dest.internalOnly", at);
    const find = s.indexOf("knowledge ?? []", at);
    expect(internal).toBeGreaterThan(at);
    expect(internal, "the row is found before the compliance check").toBeLessThan(find);
  });

  it("every internalOnly question in the registry really is refused", () => {
    // Not a hypothetical: walked over the real registry, so a question
    // marked internalOnly later is covered without being added here.
    const internalOnly = INTERVIEW_QUESTIONS.filter(
      (q) => q.writesTo.table === "business_knowledge" && (q.writesTo as any).internalOnly
    );
    for (const q of internalOnly) {
      const row = note({ title: (q.writesTo as any).title, content: "A long enough sentence to pass the length test." });
      expect(draftAnswer(q, [row], null).ok, q.key).toBe(false);
    }
  });
});

describe("3. KNOWING IT IS NOT PERMISSION TO PRINT IT", () => {
  const facts = (over: Record<string, unknown> = {}) => ({
    public_phone: "+91 81150 15907",
    publish_phone: true,
    ...over,
  });

  it("A VALUE HE HAS AGREED TO PUBLISH COMES BACK", () => {
    const out = draftAnswer(listingQuestion(), [], facts());
    expect(out.ok).toBe(true);
    expect((out as any).answer).toBe("+91 81150 15907");
  });

  it("AND ONE HE HAS NOT IS REFUSED — the load-bearing one", () => {
    // Knowing his phone number is not permission to print it.
    // business_listing_facts' own comment: "a number Hawlai knows is
    // not a number he asked to publish".
    for (const publish of [false, null, undefined, "true", 1]) {
      const out = draftAnswer(listingQuestion(), [], facts({ publish_phone: publish }));
      expect(out.ok, JSON.stringify(publish)).toBe(false);
      expect((out as any).why).toMatch(/may appear on a public page/);
    }
  });

  it("A QUESTION WITH NO PUBLISH COLUMN NEEDS NO PERMISSION", () => {
    // Some listing facts are not personal — a service area is not a
    // phone number — and those have no publish column at all.
    const q = listingQuestion({ writesTo: { table: "business_listing_facts", column: "service_area" } });
    const out = draftAnswer(q, [], { service_area: "Shahjahanpur and the villages around it" });
    expect(out.ok).toBe(true);
  });

  it("and a missing value is not an answer", () => {
    expect(draftAnswer(listingQuestion(), [], facts({ public_phone: "" })).ok).toBe(false);
    expect(draftAnswer(listingQuestion(), [], null).ok).toBe(false);
  });
});

describe("4. A SEARCH TERM HAS NO ANSWER TO DRAW ON", () => {
  it("A CANDIDATE WITH NO INTERVIEW KEY IS NEVER ANSWERED", () => {
    // There is no interview question behind a phrase somebody typed
    // into Google, so nothing is stored — and pretending otherwise is
    // how a generator gets invited back in.
    const out = draftAnswers([{ question: "soy candle workshop price" }], questionByKey, [note()], null);
    expect(out[0].draft.ok).toBe(false);
    expect((out[0].draft as any).why).toMatch(/came from a search/);
  });

  it("AND AN UNREGISTERED KEY IS NOT GUESSED AT", () => {
    const out = draftAnswers([{ question: "Something?", key: "a_key_nobody_registered" }], questionByKey, [note()], null);
    expect(out[0].draft.ok).toBe(false);
  });

  it("A REAL KEY IS ANSWERED FROM THE REAL REGISTRY", () => {
    // End to end over the actual interview definitions, so a renamed
    // `writesTo.title` breaks this rather than passing quietly.
    const real = INTERVIEW_QUESTIONS.find(
      (q) => q.writesTo.table === "business_knowledge" && !(q.writesTo as any).internalOnly
    )!;
    const row = note({ title: (real.writesTo as any).title, content: "A sentence the owner typed that is long enough." });
    const out = draftAnswers([{ question: real.prompt, key: real.key }], questionByKey, [row], null);
    expect(out[0].draft.ok, real.key).toBe(true);
  });
});

describe("5. WHAT THE OWNER READS", () => {
  const rows = (n: number, weak = 0) =>
    Array.from({ length: n }, (_, i) => ({
      question: `Q${i}`,
      key: `k${i}`,
      draft: { ok: true as const, answer: "An answer.", weak: i < weak },
    }));

  it("IT SAYS HOW MANY ARE ANSWERABLE IN HIS OWN WORDS", () => {
    expect(draftSummary(rows(3))!.text).toContain("3 of them can be answered in your own words");
    expect(draftSummary(rows(1))!.text).toContain("1 of them can be answered in your own words");
  });

  it("AND FLAGS THE THIN ONES BEFORE THEY GO PUBLIC", () => {
    expect(draftSummary(rows(3, 1))!.text).toMatch(/1 of those answers was thin/);
    expect(draftSummary(rows(2, 2))!.text).toMatch(/every one of those answers was thin/);
    expect(draftSummary(rows(3))!.text).not.toMatch(/thin/);
  });

  it("NOTHING ANSWERABLE IS SILENCE, not a discouraging sentence", () => {
    // The list itself already says what is missing. A second sentence
    // saying "none of these can be answered" is a dead end.
    expect(draftSummary([])).toBeNull();
    expect(draftSummary([{ question: "Q", key: "k", draft: { ok: false, why: "no" } }])).toBeNull();
  });

  it("every figure it prints is declared", () => {
    for (const r of [rows(3), rows(3, 2), rows(1, 1)]) {
      const out = draftSummary(r)!;
      const printed = (out.text.match(/\d+/g) ?? []).map(Number);
      const declared = out.numbers.map((n) => n.value);
      for (const p of printed) expect(declared, `${p} is not declared`).toContain(p);
    }
  });
});

describe("6. NOTHING HERE WRITES, GENERATES OR COSTS ANYTHING", () => {
  const src = () => code("src/lib/seo/answerDraft.ts");

  it("NO MODEL CALL — the whole point of A6-c as built", () => {
    const s = src();
    for (const forbidden of ["callClaude", "getModel", "webSearchTool", "anthropic"]) {
      expect(s, `the drafter can reach ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("AND NO WRITE OF ANY KIND", () => {
    const s = src();
    for (const forbidden of ["createPublishAction", "requestApproval", "insert(", "update(", "upsert("]) {
      expect(s, `the drafter can reach ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("THE SHAPE DECISION IS ANSWERED, NOT DODGED — it is always an FAQ entry", () => {
    // A question and its answer IS the faq_item shape, which A2 built
    // for this and which is what lets FAQPage schema exist. A
    // paragraph is the same words with that fact thrown away. No
    // heuristic was invented, and the comment says why.
    // sourceWithComments, NOT code(), because the COMMENT is what is
    // being asserted — Rule 8's own instruction, and code() strips
    // exactly the thing this test is about.
    expect(sourceWithComments("src/lib/seo/answerDraft.ts")).toMatch(/THE SHAPE IS ALWAYS AN FAQ ENTRY/);
    const s = code("src/lib/seo/answerDraft.ts");
    expect(s, "a shape heuristic was invented after all").not.toMatch(/shape:\s*["']paragraph["']/);
  });
});
