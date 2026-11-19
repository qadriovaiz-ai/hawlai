// "Real Estate Agent" was declared NONE — 19 November 2026.
//
// `isSpecialAdCategory` matches the exact string "real estate" against
// a FREE TEXT field with suggestions, not a fixed list. So "Real
// Estate" declared HOUSING, and "Real Estate Agent", "Property
// Dealer", "Realestate" and "Real Estate & Rentals" all declared NONE.
//
// IT FAILED OPEN, in the direction that costs the owner: an undeclared
// housing ad, sent with the age, gender and interest targeting Meta
// legally strips from housing ads. metaTargeting's own comment names
// the stake — a misdeclared category is "an account policy risk at
// worst" — and the unguarded case was the UNDER-declaration.
//
// A longer list of spellings would still miss the next one, and a list
// of trade words is what Rule 3 forbids. So: ask once, remember, and
// keep the answer internal — a compliance declaration is not a fact a
// customer should ever read back in an ad.
//
// AND IT BLOCKS RATHER THAN GOING BROAD. Unlike an irrelevant interest
// there is no safe middle: the declaration is binary, Meta enforces it
// legally, and sending NONE on a maybe is a false declaration in
// exactly the direction the founder forbade.

import { describe, it, expect } from "vitest";
import {
  specialCategoryEvidence,
  specialDeclarationFor,
  SPECIAL_CATEGORY_QUESTION,
  SPECIAL_CATEGORIES,
} from "@/lib/ads/regulatedCategory";
import { preflight } from "@/lib/ads/preflight";
import { INTERVIEW_QUESTIONS, questionByKey } from "@/lib/onboarding/interview";
import { code } from "./helpers/source";

const none = { category: null, what: null, where: null };
const cat = (text: string) => specialCategoryEvidence([{ label: "The category on your profile", text }]);

describe("1. THE SPELLINGS THAT USED TO SLIP THROUGH", () => {
  it("THE LOAD-BEARING ONE: the near-misses are now seen", () => {
    // Every one of these declared NONE before, and each is a housing
    // business.
    for (const text of ["Real Estate Agent", "Property Dealer", "Realestate", "Real Estate & Rentals", "real-estate consultant"]) {
      expect(cat(text).category, text).toBe("HOUSING");
    }
  });

  it("THE PATTERNS ARE REAL WORD BOUNDARIES, not backspace characters", () => {
    // `\\b` written into a non-raw string becomes 0x08, and a regex
    // containing a literal backspace matches NOTHING — a guard that is
    // silently dead. This codebase has shipped that exact bug once
    // before, and this file nearly did again.
    const src = code("src/lib/ads/regulatedCategory.ts");
    expect(src).not.toMatch(/\u0008/);
    expect(src).toMatch(/\/\\brealtor\\b\/i/);
  });

  it("employment and credit are seen too", () => {
    expect(cat("Recruitment Consultancy").category).toBe("EMPLOYMENT");
    expect(cat("Gold loans and finance").category).toBe("CREDIT");
    expect(cat("Mortgage advisor").category).toBe("CREDIT");
  });

  it("AND AN ORDINARY BUSINESS IS NEVER ASKED", () => {
    // The question must stay rare. A shop that never mentions any of
    // this does not see it.
    for (const text of ["Candle maker", "Restaurant / Cafe", "Salon / Spa", "Software / SaaS"]) {
      expect(cat(text).category, text).toBeNull();
    }
  });

  it("it says WHERE it saw it, so the owner can answer", () => {
    const e = cat("Property Dealer");
    expect(e.where).toBe("The category on your profile");
    expect(e.what).toBe("property");
  });
});

describe("2. THE ORDER OF WHO DECIDES", () => {
  it("AN EXACT MATCH STILL DECLARES ITSELF, with nobody asked", () => {
    // Today's behaviour, unchanged. Certainty does not need a question.
    expect(specialDeclarationFor({ exact: "HOUSING", evidence: cat("Real Estate") })).toEqual({
      kind: "declare",
      value: "HOUSING",
    });
  });

  it("THE OWNER'S ANSWER BEATS THE EVIDENCE — in both directions", () => {
    // The whole point of asking. A person who has told us outranks a
    // pattern, and that has to hold for "no" as much as for "yes".
    expect(specialDeclarationFor({ exact: null, evidence: cat("Property Dealer"), ownerAnswer: null })).toEqual({
      kind: "none",
    });
    expect(specialDeclarationFor({ exact: null, evidence: cat("Property Dealer"), ownerAnswer: "HOUSING" })).toEqual({
      kind: "declare",
      value: "HOUSING",
    });
  });

  it("THE LOAD-BEARING ONE: evidence with no answer ASKS, and blocks", () => {
    const d = specialDeclarationFor({ exact: null, evidence: cat("Real Estate Agent") });
    expect(d.kind).toBe("ask");
    expect(d.kind === "ask" && d.question).toBe(SPECIAL_CATEGORY_QUESTION);
    expect(d.kind === "ask" && d.reason).toMatch(/housing, jobs or credit/);
    expect(d.kind === "ask" && d.reason).toMatch(/won't guess/);
  });

  it("AND NO EVIDENCE IS NONE, exactly as today", () => {
    // Nothing changes for the overwhelming majority of businesses.
    expect(specialDeclarationFor({ exact: null, evidence: none })).toEqual({ kind: "none" });
    expect(specialDeclarationFor({ exact: null, evidence: cat("Candle maker") })).toEqual({ kind: "none" });
  });

  it("the ask names where it will be answered", () => {
    const d = specialDeclarationFor({ exact: null, evidence: cat("Property Dealer") });
    expect(d.kind === "ask" && d.reason).toMatch(/business details/);
    expect(d.kind === "ask" && d.reason).toMatch(/launch straight after/);
  });
});

describe("3. IT BLOCKS THE LAUNCH, AND THE ANSWER REACHES META", () => {
  it("AN UNANSWERED MAYBE IS A PREFLIGHT PROBLEM", () => {
    const r = preflight({ special: { kind: "ask", question: SPECIAL_CATEGORY_QUESTION, reason: "Answer this first." } });
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.key)).toEqual(["needs_special_category_answer"]);
  });

  it("none AND declare BOTH PASS", () => {
    expect(preflight({ special: { kind: "none" } }).ok).toBe(true);
    expect(preflight({ special: { kind: "declare", value: "HOUSING" } }).ok).toBe(true);
  });

  it("THE LOAD-BEARING ONE: a confirmed category OVERRIDES the exact-match default", () => {
    // Without this the answer is recorded and then ignored, which is
    // worse than not asking — the owner would have been asked for
    // nothing.
    const src = code("src/lib/ads/launchCampaign.ts");
    expect(src).toMatch(
      /special_ad_categories: \[special\.kind === "declare" \? special\.value : built\.specialAdCategory\]/
    );
  });

  it("THE EXACT MATCH IS CARRIED IN, so certainty is never turned into a question", () => {
    // A mutation setting `exact: null` survived the first time: an
    // owner whose category already says "Real Estate" would have been
    // ASKED, which is a question for nothing and a launch blocked on
    // a fact already known.
    //
    // And it comes from buildMetaTargeting's own answer rather than a
    // second call to isSpecialAdCategory — one source of truth, so the
    // campaign's declaration and the targeting it was built with can
    // never disagree.
    const src = code("src/lib/ads/launchCampaign.ts");
    expect(src).toMatch(
      /exact: built\.specialAdCategory !== "NONE" \? built\.specialAdCategory : null,/
    );
    expect(src).not.toMatch(/isSpecialAdCategory\(/);
  });

  it("AND THE DECISION IS MADE BEFORE THE CAMPAIGN EXISTS", () => {
    const src = code("src/lib/ads/launchCampaign.ts");
    const decide = src.indexOf("const special = specialDeclarationFor({");
    const campaign = src.indexOf("/campaigns`");
    expect(decide).toBeGreaterThan(-1);
    expect(campaign).toBeGreaterThan(decide);
  });
});

describe("4. ASKED ONCE, AND STORED WHERE A CUSTOMER NEVER SEES IT", () => {
  it("IT IS A REAL REGISTRY QUESTION, so the existing interview asks it", () => {
    // No new page and no new tool: the owner answers it where they
    // answer everything else.
    const q = questionByKey(SPECIAL_CATEGORY_QUESTION);
    expect(q).not.toBeNull();
    expect(q!.tier).toBe(2);
    expect(q!.kind).toBe("yes_no");
  });

  it("THE ANSWER IS INTERNAL-ONLY — never a fact in an ad", () => {
    // A compliance declaration is not something a customer should read
    // back. migration 229 added the column and businessFacts honours it.
    const q = questionByKey(SPECIAL_CATEGORY_QUESTION)!;
    expect(q.writesTo).toMatchObject({ table: "business_knowledge", internalOnly: true });
  });

  it("IT IS ONLY ASKED WHERE IT COULD MATTER", () => {
    // A question everybody sees is a question nobody reads, and this
    // one is about trades most businesses are not in.
    const q = questionByKey(SPECIAL_CATEGORY_QUESTION)!;
    expect(q.when).toBeTypeOf("function");
    expect(q.when!({ category: "Property Dealer" })).toBe(true);
    expect(q.when!({ category: "Candle maker" })).toBe(false);
    expect(q.when!({})).toBe(false);
  });

  it("THE KEY IS THE ONE THE LAUNCH READS", () => {
    // A mismatch would mean the owner answers and the launch never
    // notices — asked forever.
    expect(code("src/lib/ads/launchCampaign.ts")).toMatch(/\.eq\("question_key", SPECIAL_CATEGORY_QUESTION\)/);
  });

  it("AN UNREADABLE ANSWER IS 'NOT ASKED YET', which blocks", () => {
    // The safe direction for a declaration Meta enforces legally.
    const src = code("src/lib/ads/launchCampaign.ts");
    const at = src.indexOf("async function readSpecialCategoryAnswer");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, at + 1200);
    expect(fn).toMatch(/catch \{\s*return undefined;/);
    expect(fn).toMatch(/if \(!data \|\| data\.status !== "answered"\) return undefined;/);
  });

  it("the question's prompt names no trade of its own", () => {
    // Housing, jobs and credit are META'S category names, not a
    // vertical Hawlai serves — and the prompt says only those three.
    const q = questionByKey(SPECIAL_CATEGORY_QUESTION)!;
    for (const trade of ["candle", "saree", "mithai", "car", "salon"]) {
      expect(q.prompt.toLowerCase()).not.toContain(trade);
    }
  });

  it("and its key is unique in the registry", () => {
    const keys = INTERVIEW_QUESTIONS.map((q) => q.key);
    expect(keys.filter((k) => k === SPECIAL_CATEGORY_QUESTION)).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("5. RULE 3 STILL HOLDS", () => {
  it("THE CATEGORY NAMES ARE META'S OWN", () => {
    expect([...SPECIAL_CATEGORIES]).toEqual(["HOUSING", "EMPLOYMENT", "CREDIT"]);
  });

  it("AND THE TERMS STAY IN THE ONE MODULE THAT MAY HOLD THEM", () => {
    // regulatedCategory.ts already carries Meta's regulated scope and
    // the walk that stops it reaching anything which writes copy. One
    // module, not two.
    const src = code("src/lib/ads/regulatedCategory.ts");
    expect(src).toMatch(/SPECIAL_TERMS/);
    expect(code("src/lib/ads/metaTargeting.ts")).not.toMatch(/SPECIAL_TERMS/);
  });
});
