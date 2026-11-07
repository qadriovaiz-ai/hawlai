// A page the business does not have, for a search people really made
// (G3 of docs/AUDIT-GROWTH-LOOP.md).
//
// THE ONE HOP THE VISION ASKS FOR THAT DID NOT EXIST. Everything on
// either side was already built: marketOpportunities.ts finds the gap
// from Google's own impressions, POST /api/website-builder/pages creates
// a page, the claims guard checks copy, the approval registry asks. What
// was missing was the sentence between them.
//
// THE RULE THIS FILE EXISTS TO HOLD, and it is the audit's own central
// finding turned into a test: the vision asks for MEASUREMENT, and
// several things in this product that carry the right name are ADVICE.
// A proposal built from invented keywords would have been the fourth.
// So every number in a proposal is Google's, every fact in it is the
// owner's, and not one word of customer-facing copy is written here.

import { describe, it, expect } from "vitest";
import { code, sql } from "./helpers/source";

import {
  BUYING_PAGE_NEEDS,
  NAMED_QUESTION_KEYS,
  PAGE_WORTH_IT,
  contentWords,
  proposalConfirm,
  proposalFor,
  sameSubject,
  slugFromQuery,
  titleFromQuery,
} from "@/lib/opportunities/pageProposal";
import { questionByKey } from "@/lib/onboarding/interview";
import { getActionPolicy } from "@/lib/executionPolicy";

const gap = (query: string, impressions: number): any => ({ query, impressions, clicks: 0, position: 12 });

// ---------------------------------------------------------------------
describe("1. A PROPOSAL IS MADE OF COUNTED THINGS", () => {
  it("THE TITLE IS THE CUSTOMER'S OWN SEARCH, tidied and nothing else", () => {
    // The only source of a page title that cannot smuggle one trade's
    // vocabulary in — CLAUDE.md rule 3.
    expect(titleFromQuery("soy candles in shahjahanpur")).toBe("Soy candles in shahjahanpur");
    expect(titleFromQuery("  how much does a saree cost  ")).toBe("How much does a saree cost");
  });

  it("AND IT IS NOT TITLE-CASED INTO A HEADLINE NOBODY WROTE", () => {
    expect(titleFromQuery("best coaching near me")).not.toBe("Best Coaching Near Me");
  });

  it("THE IMPRESSIONS ARE GOOGLE'S, carried through untouched", () => {
    const p = proposalFor(gap("a thing people search", 120))!;
    expect(p.impressions).toBe(120);
    expect(p.query).toBe("a thing people search");
  });

  it("NOTHING IS PROPOSED BELOW THE THRESHOLD", () => {
    // Writing a page is the owner's afternoon.
    //
    // THE NUMBER IS ASSERTED, NOT JUST THE BOUNDARY. The first version
    // only compared against PAGE_WORTH_IT itself, so lowering the
    // constant to 1 moved the boundary with it and the test still
    // passed — an assertion that reads the value it is testing proves
    // only that arithmetic works.
    expect(PAGE_WORTH_IT).toBe(50);
    expect(proposalFor(gap("a thing", 20))).toBeNull();
    expect(proposalFor(gap("a thing", 49))).toBeNull();
    expect(proposalFor(gap("a thing", 50))).not.toBeNull();
  });

  it("and a search with no impressions at all proposes nothing", () => {
    expect(proposalFor(gap("a thing", 0))).toBeNull();
    expect(proposalFor({ query: "a thing" } as any)).toBeNull();
    expect(proposalFor(gap("a thing", NaN))).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("2. A PAGE THAT ALREADY EXISTS IS NOT A GAP", () => {
  it("AN EXISTING SLUG STOPS THE PROPOSAL", () => {
    // Proposing a page the owner already wrote is the `no_faq` mistake
    // again: a finding that fires against work already done teaches
    // them to ignore findings.
    const slug = slugFromQuery("soy candles shahjahanpur");
    expect(proposalFor(gap("soy candles shahjahanpur", 90), { existingSlugs: [slug] })).toBeNull();
    expect(proposalFor(gap("soy candles shahjahanpur", 90), { existingSlugs: ["about"] })).not.toBeNull();
  });

  it("THE SLUG IS DERIVED FROM THE SEARCH'S MEANING, not its filler", () => {
    expect(slugFromQuery("best soy candles near me in india")).toBe("soy-candles");
    expect(slugFromQuery("how much does a candle cost")).toBe("candle");
  });

  it("AND A SEARCH WITH NOTHING SLUGGABLE PROPOSES NOTHING", () => {
    // So a caller can never end up proposing a page at an empty path.
    expect(slugFromQuery("the best near me")).toBe("");
    expect(proposalFor(gap("the best near me", 400))).toBeNull();
    expect(proposalFor(gap("???", 400))).toBeNull();
  });

  it("a slug is never longer than a URL should be, and never ends in a dash", () => {
    const long = slugFromQuery(Array.from({ length: 30 }, (_, i) => `word${i}`).join(" "));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });
});

// ---------------------------------------------------------------------
describe("3. ONE PAGE CAN ANSWER SEVERAL SEARCHES, and the grouping is strict", () => {
  it("A LONGER SEARCH ABOUT THE SAME THING IS GROUPED IN", () => {
    expect(sameSubject("soy candles", "soy candles gift box")).toBe(true);
    expect(sameSubject("soy candles gift box", "soy candles")).toBe(true);
  });

  it("AND A DIFFERENT SUBJECT IS NOT", () => {
    expect(sameSubject("soy candles", "scented oils")).toBe(false);
    expect(sameSubject("maths tuition", "english tuition")).toBe(false);
  });

  it("TWO SEARCHES SHARING ONLY FILLER SHARE NOTHING", () => {
    // "best X near me" and "best Y near me" are not the same subject.
    expect(sameSubject("best near me", "best near me too")).toBe(false);
    expect(contentWords("best cheap thing near me in india")).toEqual(["thing"]);
  });

  it("THE CARD COUNTS THE GROUPED IMPRESSIONS, not just the first", () => {
    const all = [gap("soy candles", 90), gap("soy candles gift box", 60), gap("scented oils", 200)];
    const p = proposalFor(all[0], { allGaps: all })!;
    expect(p.answers.map((a) => a.query)).toEqual(["soy candles", "soy candles gift box"]);
    expect(proposalConfirm(p)).toContain("together 150 times");
  });

  it("and one search on its own says so in the singular", () => {
    const p = proposalFor(gap("soy candles", 90), { allGaps: [gap("soy candles", 90)] })!;
    const card = proposalConfirm(p);
    expect(card).toContain("90 times in 28 days");
    // AND NOT THROUGH THE PLURAL BRANCH. "1 searches, together 90 times
    // in 28 days" CONTAINS the string above, so the positive assertion
    // alone was satisfied by the wrong sentence — the same substring
    // trap as `weak:` inside `is_weak:`.
    expect(card).not.toContain("searches, together");
    expect(card).not.toContain("1 searches");
  });
});

// ---------------------------------------------------------------------
describe("4. THE PROPOSAL SAYS WHAT IS MISSING RATHER THAN WRITING ROUND IT", () => {
  it("EVERY QUESTION IT NAMES IS A REAL INTERVIEW QUESTION", () => {
    // A proposal naming something missing is naming something the owner
    // can actually go and answer.
    expect(NAMED_QUESTION_KEYS).toEqual(BUYING_PAGE_NEEDS);
    for (const key of BUYING_PAGE_NEEDS) expect(questionByKey(key)).not.toBeNull();
  });

  it("AN UNANSWERED QUESTION IS NAMED ON THE CARD", () => {
    const p = proposalFor(gap("soy candles", 90), { answered: [] })!;
    expect(p.missing).toEqual(BUYING_PAGE_NEEDS);
    const card = proposalConfirm(p);
    expect(card).toMatch(/I don't have your .* yet, so I can't write the page for you/);
    expect(card).toMatch(/it will be empty until you tell me those or write it yourself/);
  });

  it("AND AN ANSWERED ONE IS NOT", () => {
    const p = proposalFor(gap("soy candles", 90), { answered: BUYING_PAGE_NEEDS })!;
    expect(p.missing).toEqual([]);
    expect(proposalConfirm(p)).toMatch(/I won't write the words/);
  });

  it("WHAT THE OWNER HAS ALREADY WRITTEN DOWN IS NAMED TOO", () => {
    const p = proposalFor(gap("soy candles", 90), {
      recorded: [
        { title: "What we use", content: "Soy wax only, never paraffin." },
        { title: "Reply time", content: "Within a day." },
      ],
    })!;
    expect(p.haveOnRecord).toEqual(["What we use"]);
    expect(proposalConfirm(p)).toContain("What you've already written down that belongs on it: What we use.");
  });

  it("and a business with nothing recorded gets no such sentence", () => {
    const p = proposalFor(gap("soy candles", 90), { recorded: [] })!;
    expect(p.haveOnRecord).toEqual([]);
    expect(proposalConfirm(p)).not.toContain("already written down");
  });
});

// ---------------------------------------------------------------------
describe("5. NOT ONE WORD OF COPY IS WRITTEN BY THIS", () => {
  it("THE CARD SAYS THE PAGE WILL BE A DRAFT AND UNREACHABLE", () => {
    const card = proposalConfirm(proposalFor(gap("soy candles", 90))!);
    expect(card).toMatch(/as a draft at \/soy-candles/);
    expect(card).toMatch(/nobody can reach it and it won't be in your sitemap until you publish it/);
  });

  it("THE PROPOSAL CARRIES NO SELLING POINT, NO CLAIM AND NO STATISTIC", () => {
    // The one thing the audit argued back about: a product that writes
    // a statistic for a business that measured nothing is fabricating
    // evidence.
    const src = code("src/lib/opportunities/pageProposal.ts");
    for (const forbidden of [/\bbenefit/i, /\bselling point/i, /\bstatistic/i, /\btestimonial/i]) {
      // Named only in the comments that forbid them, never in code.
      expect(src).not.toMatch(forbidden);
    }
  });

  it("AND THE MODULE IS PURE — no model, no database, no React", () => {
    const src = code("src/lib/opportunities/pageProposal.ts");
    expect(src).not.toMatch(/^import .*supabase/m);
    expect(src).not.toMatch(/^import .*(claude|anthropic|ai\/)/mi);
    expect(src).not.toMatch(/^import .*react/mi);
  });

  it("not one prompt word names a trade — rule 3", () => {
    const src = code("src/lib/opportunities/pageProposal.ts").toLowerCase();
    for (const word of ["candle", "saree", "mithai", "tuition", "showroom", "test drive"]) {
      expect(src).not.toContain(word);
    }
  });
});

// ---------------------------------------------------------------------
describe("6. NOTHING ACTS WITHOUT A REGISTRY ENTRY", () => {
  it("create_page_draft IS CLASSIFIED AND ASKS FIRST", () => {
    const policy = getActionPolicy("create_page_draft")!;
    expect(policy).toBeTruthy();
    expect(policy.requiresApproval).toBe(true);
    expect(policy.actionType).toBe("create");
  });

  it("AND IT IS LOW RISK BECAUSE NOTHING BECOMES PUBLIC", () => {
    // The page is created with published false (migration 223), so
    // nothing is reachable and nothing enters the sitemap until the
    // owner presses Publish.
    expect(getActionPolicy("create_page_draft")!.riskLevel).toBe("low");
  });

  it("THE APPROVALS ROUTE CARRIES IT OUT", () => {
    // A card nobody executes is a dead end: the owner presses Approve
    // and nothing happens.
    const route = code("src/app/api/approvals/[id]/route.ts");
    expect(route).toMatch(/action_type === "create_page_draft"/);
  });

  it("THE PAGE IS CREATED UNPUBLISHED, from a literal", () => {
    const route = code("src/app/api/approvals/[id]/route.ts");
    const branch = route.slice(route.indexOf('action_type === "create_page_draft"'), route.indexOf('action_type === "grant_autonomy"'));
    expect(branch).toMatch(/published: false,/);
    // Never read from the card.
    expect(branch).not.toMatch(/published: .*action_details/);
  });

  it("AND THE SLUG IS RE-DERIVED, never trusted from the card", () => {
    // A stored action_details is a value the server should not act on
    // blindly — the lesson the toggle and autonomy branches record.
    const route = code("src/app/api/approvals/[id]/route.ts");
    const branch = route.slice(route.indexOf('action_type === "create_page_draft"'), route.indexOf('action_type === "grant_autonomy"'));
    expect(branch).toMatch(/const slug = slugFromQuery\(query\)/);
    expect(branch).toMatch(/const title = titleFromQuery\(query\)/);
    expect(branch).not.toMatch(/action_details as any\)\?\.slug/);
  });

  it("A COLLISION IS SAID, not worked around with a numbered slug", () => {
    // The owner approved a page for a search; a second page at `-2` is
    // not that page.
    //
    // THE CONDITION IS ASSERTED, NOT THE MESSAGE. A mutation replacing
    // the `if` with `if (false)` left the sentence sitting in the source
    // and this test green — a source grep cannot see reachability, so
    // what it has to pin is the test being made, not the words printed
    // when it fails.
    const route = code("src/app/api/approvals/[id]/route.ts");
    const branch = route.slice(route.indexOf('action_type === "create_page_draft"'), route.indexOf('action_type === "grant_autonomy"'));
    expect(branch).toMatch(/if \(\(existing \?\? \[\]\)\.some\(\(p: any\) => p\.slug === slug\)\) \{/);
    expect(branch).toMatch(/You already have a page at/);
    expect(branch).not.toMatch(/-\$\{attempt/);
  });
});

// ---------------------------------------------------------------------
describe("7. ASKED ONCE PER SEARCH, AND ONE AT A TIME", () => {
  const writer = code("src/lib/opportunities/proposePage.ts");

  it("A SEARCH ALREADY PROPOSED IS NEVER PROPOSED AGAIN", () => {
    // Whatever the owner decided. "No" is an answer.
    expect(writer).toMatch(/\.eq\("action_type", "create_page_draft"\)/);
    expect(writer).toMatch(/alreadyAsked\.has\(gap\.query\.toLowerCase\(\)\)/);
    expect(writer).not.toMatch(/\.eq\("status", "pending"\)/);
  });

  it("ONE CARD PER RUN, because three is a backlog", () => {
    expect(writer).toMatch(/export const MAX_PER_RUN = 1;/);
    expect(writer).toMatch(/if \(out\.proposed\.length >= MAX_PER_RUN\) break;/);
  });

  it("THE STRONGEST GAP GOES FIRST", () => {
    expect(writer).toMatch(/\.sort\(\(a, b\) => b\.impressions - a\.impressions\)/);
  });

  it("A FAILED READ PROPOSES NOTHING rather than risking a duplicate", () => {
    // The cost of staying quiet is one missed card; the cost of being
    // wrong is a duplicate page on a real site.
    expect(writer).toMatch(/if \(pageError\) \{/);
    expect(writer).toMatch(/if \(raisedError\) \{/);
    expect(writer).toMatch(/could not read what has already been proposed/);
  });

  it("and it goes through requestApproval rather than writing a row itself", () => {
    expect(writer).toMatch(/await requestApproval\(supabase, dealershipId, \{/);
    expect(writer).not.toMatch(/from\("pending_approvals"\)\.insert/);
  });
});

// ---------------------------------------------------------------------
describe("8. THE STALE COMMENT ABOUT THE DRAFT LAYER IS CORRECTED", () => {
  it("executionPolicy NO LONGER CLAIMS THERE IS NO DRAFT LAYER", () => {
    // It said "there is no draft layer inside a published site", which
    // was true when written and stopped being true with migration 223.
    // A comment that is quietly false is worse than no comment.
    const policy = sql("src/lib/executionPolicy.ts");
    expect(policy).not.toMatch(/There is no draft\s*\n?\s*\/\/ layer inside a published site/);
  });

  it("AND IT SAYS WHAT DID NOT CHANGE", () => {
    const raw = code("src/lib/executionPolicy.ts");
    // update_page_text's risk is unchanged: an edit to an
    // already-published page is still public the moment it saves.
    expect(getActionPolicy("update_page_text")!.riskLevel).toBe("medium");
    expect(raw).toMatch(/update_page_text:/);
  });
});
