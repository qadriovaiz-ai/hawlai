// Questions that get asked and the site does not answer — A6-a.
//
// ──────────────────────────────────────────────────────────────────
// IT WRITES NOTHING, and that is why it ships before the rest of A6.
// The real risk in that plan is at the other end: deciding a question
// deserves a page, getting it wrong generously, and mass-producing
// thin pages — the most reliable way to damage a small site, and it
// would be Hawlai doing it unasked. A list cannot write a wrong page.
//
// THE OWNER'S SCOPE DECISION, 24 November 2026: FAQ entries and
// paragraphs on existing pages only. New pages are out until a need
// shows. So this piece deliberately does NOT decide shape either —
// that is A6-b, and guessing it here would be the planner reaching
// into the decision it exists to inform.
//
// THREE SOURCES, NOT EQUAL. `answer_gaps` is the market naming the
// gap: a real customer wanted to know something and the records had
// nothing. Every other gap in this product is one the product went
// looking for. It ranks first, always.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  planAnswers,
  answerGapLine,
  alreadyAnswered,
  siteVocabulary,
  MIN_IMPRESSIONS,
  MAX_CANDIDATES,
} from "@/lib/seo/answerPlanner";
import { buildDailyReport, everyNumberIsCounted, withoutUncountedBlocks, renderText } from "@/lib/growth/report";
import { maturityOf } from "@/lib/growth/strategy";
import { code } from "./helpers/source";

const NOW = new Date("2026-11-24T04:00:00Z");

const tracking = () =>
  ({
    siteEvents: { firing: true, lastAt: "2026-11-23T10:00:00Z", visitorEvents30d: 41, firstAt: "2026-08-01T10:00:00Z" },
    searchConsole: { connected: true, siteUrl: "https://example.test" },
    site: { published: true, why: "your site is published" },
    adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" },
    health: "ok",
  }) as any;

const sections = (body: string) => [{ type: "text", props: { body } }];

const input = (over: Partial<Parameters<typeof planAnswers>[0]> = {}) => ({
  asked: [],
  searched: [],
  buyerIntent: [],
  pageSections: [],
  ...over,
});

describe("1. A CUSTOMER'S QUESTION OUTRANKS EVERYTHING", () => {
  it("ASKED BEATS A SEARCH TERM WITH FAR MORE DEMAND", () => {
    // THE LOAD-BEARING ONE. One customer who asked and got nothing is
    // evidence that somebody wanted an answer and did not get it. Two
    // hundred impressions may be people who found what they needed.
    const out = planAnswers(
      input({
        asked: [{ question: "Do you deliver outside the city?", times: 1 }],
        searched: [{ query: "soy candle workshop price", impressions: 200 }],
      })
    );
    expect(out[0].source).toBe("asked");
    expect(out[0].question).toBe("Do you deliver outside the city?");
    expect(out[1].source).toBe("search");
  });

  it("AND THE FIXED BUYER QUESTIONS COME LAST, because they are ours", () => {
    const out = planAnswers(
      input({
        asked: [{ question: "Do you deliver?", times: 1 }],
        searched: [{ query: "candle workshop", impressions: 50 }],
        buyerIntent: ["Which workshop should I pick?"],
      })
    );
    expect(out.map((c) => c.source)).toEqual(["asked", "search", "buyer_intent"]);
  });

  it("WITHIN A SOURCE, MORE DEMAND FIRST", () => {
    const out = planAnswers(
      input({ asked: [{ question: "Refunds?", times: 1 }, { question: "Shipping times?", times: 4 }] })
    );
    expect(out.map((c) => c.question)).toEqual(["Shipping times?", "Refunds?"]);
  });

  it("THE REASON SAYS HOW MANY CUSTOMERS ASKED, singular and plural", () => {
    expect(planAnswers(input({ asked: [{ question: "Refunds?", times: 1 }] }))[0].why).toBe(
      "a customer asked this and your records had no answer"
    );
    expect(planAnswers(input({ asked: [{ question: "Refunds?", times: 3 }] }))[0].why).toContain("3 customers asked");
  });

  it("and a thin search term is not a finding", () => {
    // One person once is not demand.
    const out = planAnswers(input({ searched: [{ query: "candle workshop", impressions: MIN_IMPRESSIONS - 1 }] }));
    expect(out).toEqual([]);
    expect(planAnswers(input({ searched: [{ query: "candle workshop", impressions: MIN_IMPRESSIONS }] })).length).toBe(1);
  });
});

describe("2. ONE PROBLEM IS ONE ENTRY", () => {
  it("THE SAME QUESTION FROM TWO SOURCES COLLAPSES TO THE STRONGER", () => {
    // It routinely arrives as an answer_gaps key AND a search query.
    // Listing it twice would make the list look longer than the
    // problem.
    const out = planAnswers(
      input({
        asked: [{ question: "Do you deliver outside the city?", times: 2 }],
        searched: [{ query: "deliver outside city", impressions: 90 }],
      })
    );
    expect(out.length).toBe(1);
    expect(out[0].source).toBe("asked");
  });

  it("AND WORD ORDER AND PUNCTUATION ARE ONE QUESTION", () => {
    // MY FIRST EXPECTATION HERE WAS WRONG: "do you deliver" and
    // "delivery?" are NOT one question to this code, because nothing
    // stems — "deliver" and "delivery" are different words. That is
    // deliberate rather than missing: a stemmer would merge "candle"
    // and "candles" usefully and also merge things that are not the
    // same, and there is no stemmer in this repo to be consistent
    // with. So the dedupe is on content words, and this is what it
    // genuinely catches.
    const out = planAnswers(
      input({
        searched: [
          { query: "Do you deliver to Shahjahanpur?", impressions: 40 },
          { query: "deliver shahjahanpur", impressions: 30 },
        ],
      })
    );
    expect(out.map((c) => c.question)).toEqual(["Do you deliver to Shahjahanpur?"]);
  });

  it("AND A QUESTION WORD IS NOT WHAT MAKES TWO QUESTIONS DIFFERENT", () => {
    // The shared STOPWORDS list was built for search queries and keeps
    // "do", "can", "we". Without the question-word layer these would
    // be two entries for one problem.
    // AND I WROTE THIS FIXTURE WRONG TWICE, the same way both times:
    // "delivery" against "deliver". Nothing stems, so those are two
    // words however many question words are stripped. The same stem on
    // both sides is what isolates the question-word layer.
    const out = planAnswers(
      input({
        asked: [{ question: "Do you deliver outside the city?", times: 1 }],
        searched: [{ query: "can we deliver outside city", impressions: 50 }],
      })
    );
    expect(out.length).toBe(1);
  });

  it("THE LIST IS CAPPED, because a longer one is read by nobody", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ question: `Question about topic${i}?`, times: 1 }));
    expect(planAnswers(input({ asked: many })).length).toBe(MAX_CANDIDATES);
    expect(MAX_CANDIDATES).toBeLessThanOrEqual(10);
  });

  it("and blank questions are dropped rather than listed", () => {
    expect(planAnswers(input({ asked: [{ question: "", times: 2 }, { question: "   ", times: 1 }] }))).toEqual([]);
  });
});

describe("3. 'ALREADY ANSWERED' ERRS TOWARD LISTING", () => {
  it("EVERY CONTENT WORD MUST BE ON THE SITE, not some", () => {
    // A false "answered" HIDES a real gap and nothing happens. A false
    // "not answered" puts a duplicate on a list somebody reads in a
    // glance. The strict test is the right way round.
    const words = siteVocabulary([sections("We deliver across the city within two days.")]);
    expect(alreadyAnswered("Do you deliver across the city?", words)).toBe(true);
    // "Refunds" is nowhere on the page, so the question stays listed
    // even though "do you" matches.
    expect(alreadyAnswered("Do you give refunds?", words)).toBe(false);
  });

  it("A PARTIAL OVERLAP IS NOT AN ANSWER — the case that matters", () => {
    // FOUND BY MUTATION. Both cases above share NO words with the
    // page, so `every` and `some` agree on them and relaxing the rule
    // survived. The dangerous case is PARTIAL overlap: the site says
    // it delivers across the city, the customer asks about another
    // town, and "deliver" matching would hide a question the business
    // has genuinely never answered — the exact failure mode the strict
    // rule exists for.
    const words = siteVocabulary([sections("We deliver across the city within two days.")]);
    expect(alreadyAnswered("Do you deliver to Lucknow?", words), "a partial match was read as an answer").toBe(false);
    expect(alreadyAnswered("How long does delivery across the city take?", words)).toBe(false);
  });

  it("AND AN ANSWERED QUESTION IS NOT PROPOSED AT ALL", () => {
    const out = planAnswers(
      input({
        asked: [{ question: "Do you deliver across the city?", times: 3 }],
        pageSections: [sections("We deliver across the city within two days.")],
      })
    );
    expect(out).toEqual([]);
  });

  it("A QUESTION OF ONLY STOPWORDS IS NEVER 'ANSWERED'", () => {
    // "how much is it" is all stopwords. Calling that answered because
    // nothing had to match would silently drop the commonest question
    // there is.
    const words = siteVocabulary([sections("Candles.")]);
    expect(alreadyAnswered("how much is it", words)).toBe(false);
  });

  it("AN EMPTY SITE ANSWERS NOTHING", () => {
    expect(alreadyAnswered("Do you deliver?", siteVocabulary([]))).toBe(false);
    expect(alreadyAnswered("Do you deliver?", siteVocabulary([null, undefined] as any))).toBe(false);
  });

  it("and a block's own metadata is not the site's vocabulary", () => {
    // The shared extractor's skip list, relied on from here too: the
    // word "text" is a block type, not something the site says.
    expect(siteVocabulary([sections("Candles.")]).has("text")).toBe(false);
  });
});

describe("4. WHAT THE OWNER READS", () => {
  const candidates = () =>
    planAnswers(
      input({
        asked: [{ question: "Do you deliver outside the city?", times: 2 }],
        searched: [{ query: "soy candle workshop price", impressions: 90 }],
      })
    );

  it("IT NAMES THE FIRST QUESTION, not just a count", () => {
    // "Nine questions your site does not answer" is a number he cannot
    // act on. The question itself tells him whether the list is good.
    const line = answerGapLine(candidates())!;
    expect(line.text).toContain('"Do you deliver outside the city?"');
    expect(line.text).toContain("2 customers asked this");
  });

  it("AND IT SAYS NOTHING HAS BEEN WRITTEN", () => {
    // A6-a writes nothing, and the line must not read like a draft is
    // waiting somewhere.
    expect(answerGapLine(candidates())!.text).toContain("Nothing has been written");
    expect(answerGapLine(candidates())!.text).toContain("for you to decide");
  });

  it("IT SAYS HOW MANY CAME FROM CUSTOMERS", () => {
    expect(answerGapLine(candidates())!.text).toContain("1 of them by a customer");
    const allAsked = planAnswers(input({ asked: [{ question: "Refunds?", times: 1 }, { question: "Shipping?", times: 1 }] }));
    expect(answerGapLine(allAsked)!.text).toContain("every one of them by a customer");
  });

  it("AN EMPTY LIST IS SILENCE", () => {
    // The normal state for a business with no Search Console
    // connection and no customer questions on record.
    expect(answerGapLine([])).toBeNull();
    expect(answerGapLine(null as any)).toBeNull();
  });

  it("one question reads as one, not as '1 questions'", () => {
    const one = planAnswers(input({ asked: [{ question: "Refunds?", times: 1 }] }));
    expect(answerGapLine(one)!.text).toContain("1 question gets asked");
    expect(answerGapLine(one)!.text).not.toContain("1 questions");
  });
});

describe("5. IT SURVIVES THE DAILY REPORT'S DIGIT WALK", () => {
  const build = (answerGaps: any) =>
    buildDailyReport({
      dealershipId: "d1",
      day: "2026-11-24",
      businessName: "Candle by Qaaf",
      tracking: tracking(),
      maturity: maturityOf({ firstAt: "2026-08-01T10:00:00Z", events: 41 }, NOW),
      counted: [{ label: "Products", value: 6, source: "products" }],
      suggestions: [],
      setupGoals: [],
      activeGoals: 1,
      findingCount: 0,
      answerGaps,
    });

  it("EVERY FIGURE IS DECLARED, so the block is not silently removed", () => {
    const line = answerGapLine(
      planAnswers(input({ asked: [{ question: "Do you deliver outside the city?", times: 2 }], searched: [{ query: "candle price", impressions: 90 }] }))
    );
    const report = build(line);
    const check = everyNumberIsCounted(report);
    expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);
    const { report: sendable, removed } = withoutUncountedBlocks(report);
    expect(removed, "the answer-gap line was dropped as uncounted").toEqual([]);
    expect(renderText(sendable)).toMatch(/questions get asked/);
  });

  it("AND FOR A LIST WITH NO CUSTOMER QUESTIONS IN IT", () => {
    // The second figure is absent in that case, so the sentence and
    // the declared numbers have to agree.
    const line = answerGapLine(planAnswers(input({ searched: [{ query: "candle workshop price", impressions: 40 }] })));
    expect(everyNumberIsCounted(build(line)).offenders).toEqual([]);
  });

  it("NO LIST MEANS NO BLOCK", () => {
    const text = build(null)
      .blocks.filter((b: any) => b.kind === "line")
      .map((b: any) => b.text)
      .join("\n");
    expect(text).not.toMatch(/questions get asked/);
  });
});

describe("6. THE SHAPE OF THE READ, AND WHAT IT DOES NOT DO", () => {
  const src = () => code("src/lib/seo/answerPlanner.ts");

  it("IT WRITES NOTHING TO THE SITE", () => {
    // THE PROPERTY THAT MAKES A6-a SAFE TO SHIP FIRST.
    const s = src();
    for (const writer of ["createPublishAction", "requestApproval", "update_page_text", "update_page_meta", "insert("]) {
      expect(s, `the planner can reach ${writer}`).not.toContain(writer);
    }
  });

  it("AND IT DECIDES NO SHAPE — that is A6-b", () => {
    const s = src();
    expect(s, "the planner guessed FAQ vs paragraph").not.toMatch(/shape:|"faq"|'faq'/);
  });

  it("A KEY WITH NO REGISTERED QUESTION IS SKIPPED, not guessed at", () => {
    // factGaps' rule, reused: a gap that cannot be turned into a
    // question is a gap nobody can be asked about.
    const s = src();
    const at = s.indexOf("questionByKey(key)");
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, at + 160);
    expect(block).toMatch(/if \(registered\?\.prompt\)/);
  });

  it("A FAILED PAGE READ LISTS NOTHING, rather than listing everything", () => {
    // Treating it as an empty site would make every question look
    // unanswered.
    expect(src()).toMatch(/if \(!Array\.isArray\(pages\)\) return empty;/);
  });

  it("and it never throws into the daily report", () => {
    const s = src();
    expect(s).toMatch(/catch \(err: any\)/);
    expect(s, "a planner failure cost the rest of the email").not.toMatch(/throw /);
  });

  it("the signal it files is counted, and one row per business", () => {
    const daily = code("src/lib/growth/dailyGrowth.ts");
    const at = daily.indexOf("questions without answers");
    expect(at).toBeGreaterThan(-1);
    const block = daily.slice(at - 400, at + 900);
    expect(block).toMatch(/confidence: "counted"/);
    expect(block).toMatch(/fingerprintOf\(\["seo", "questions without answers"\]\)/);
  });
});

describe("7. THE AEO SIGNAL NO LONGER CLAIMS AN AI ASSISTANT WAS ASKED", () => {
  it("IT SAYS WEB SEARCH, matching aeoAgent's own disclosure", () => {
    // CORRECTED 24 November 2026. The summary said "buying questions
    // an AI assistant was asked", while aeoAgent's fixed DISCLOSURE
    // says the check is "not a direct query of ChatGPT, Gemini, or
    // Perplexity, which Hawlai has no API access to". The owner read
    // the first sentence; nothing had caught it.
    const s = code("src/lib/seo/aeoPresence.ts");
    expect(s, "the false claim is back").not.toMatch(/an AI assistant was asked/);
    expect(s).toMatch(/checked in a web search/);
  });

  it("AND THE DISCLOSURE IT MUST AGREE WITH IS STILL THERE", () => {
    // If that disclosure were ever softened, the sentence above would
    // stop being the honest one and this test would be guarding
    // nothing.
    const agent = code("src/lib/agents/aeoAgent.ts");
    expect(agent).toMatch(/not a direct query of ChatGPT, Gemini, or Perplexity/);
  });
});

describe("8. SEARCH QUERIES COME THROUGH THE ONE PERMITTED DOOR", () => {
  it("THE PLANNER NEVER READS search_queries DIRECTLY", () => {
    // CAUGHT BY tests/searchConsolePrivacy ON THE FIRST FULL RUN, and
    // it was a real privacy bug rather than a test inconvenience:
    // `topQueries` filters out rows with no `page_filter` — domain-wide
    // leftovers written before scoping existed, which can describe
    // pages that are not this business's. Reading the table directly
    // would have bypassed that silently.
    //
    // That guard already sweeps all of src/, so this asserts the
    // positive half it cannot: that the planner goes through the door
    // rather than simply not touching the table.
    const s = code("src/lib/seo/answerPlanner.ts");
    expect(s, "a second door into search_queries was opened").not.toContain('from("search_queries")');
    expect(s).toMatch(/topQueries\(supabase, dealershipId/);
  });
});

// ──────────────────────────────────────────────────────────────────
// 9. THE READ, RUN FOR REAL
//
// FOUND BY MUTATION. Everything above tests the pure functions, so two
// wiring regressions survived: dropping the interview key on the way
// out of answer_gaps (nothing becomes answerable, ever) and running the
// drafting queries for every business every morning whether or not
// there is anything to answer.
//
// Nothing executed gatherAnswerGaps, so a source grep was the only
// option — and a grep cannot tell that the key ARRIVES, only that the
// word appears. This runs it.
// ──────────────────────────────────────────────────────────────────

import { gatherAnswerGaps } from "@/lib/seo/answerPlanner";
import { INTERVIEW_QUESTIONS } from "@/lib/onboarding/interview";

/** A real question with a public, knowledge-backed answer. */
const REAL = INTERVIEW_QUESTIONS.find(
  (q) => q.writesTo.table === "business_knowledge" && !(q.writesTo as any).internalOnly
)!;

function plannerDb(opts: { gaps?: string[]; knowledge?: any[] } = {}) {
  const read: string[] = [];
  const from = (table: string) => {
    read.push(table);
    const rows =
      table === "answer_gaps"
        ? (opts.gaps ?? []).map((question_key) => ({ question_key }))
        : table === "business_knowledge"
        ? opts.knowledge ?? []
        : table === "website_pages"
        ? [{ sections: [{ props: { body: "Nothing relevant on this page at all." } }] }]
        : [];
    const single =
      table === "websites"
        ? { id: "w1" }
        : table === "dealerships"
        ? { business_category: "Home fragrance", city: "Shahjahanpur" }
        : table === "business_listing_facts"
        ? { public_phone: "", publish_phone: false }
        : null;
    const api: any = {
      select: () => api,
      eq: () => api,
      not: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: single, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return api;
  };
  return { client: { from }, read };
}

describe("9. THE READ, RUN FOR REAL", () => {
  it("THE INTERVIEW KEY ARRIVES, so a customer's question can be answered", async () => {
    const note = {
      title: (REAL.writesTo as any).title,
      content: "A sentence the owner typed himself, long enough to be a real answer.",
      is_weak: false,
      is_active: true,
    };
    const { client } = plannerDb({ gaps: [REAL.key, REAL.key], knowledge: [note] });
    const out = await gatherAnswerGaps(client as any, "d1");

    const mine = out.candidates.find((c) => c.key === REAL.key);
    expect(mine, "the interview key was dropped on the way out of answer_gaps").toBeTruthy();
    expect(mine!.source).toBe("asked");

    const drafted = out.drafted.find((d) => d.key === REAL.key);
    expect(drafted?.draft.ok, "a question with a stored answer came back unanswerable").toBe(true);
    expect(out.answers?.text).toContain("can be answered in your own words");
  });

  it("AND THE DRAFTING QUERIES DO NOT RUN WHEN THERE IS NOTHING TO ANSWER", async () => {
    // Two extra reads per business per morning, for every business
    // that has no customer questions on record — which is most of them.
    const { client, read } = plannerDb({ gaps: [] });
    const out = await gatherAnswerGaps(client as any, "d1");
    expect(out.drafted).toEqual([]);
    expect(read, "business_knowledge was read with nothing to answer").not.toContain("business_knowledge");
    expect(read).not.toContain("business_listing_facts");
  });

  it("AND AN UNANSWERABLE QUESTION SAYS SO RATHER THAN DISAPPEARING", async () => {
    // The gap is still worth listing: he just has to tell Hawlai
    // something first.
    const { client } = plannerDb({ gaps: [REAL.key], knowledge: [] });
    const out = await gatherAnswerGaps(client as any, "d1");
    expect(out.candidates.some((c) => c.key === REAL.key)).toBe(true);
    expect(out.drafted.find((d) => d.key === REAL.key)?.draft.ok).toBe(false);
    expect(out.answers, "an unanswerable list produced an answers sentence").toBeNull();
  });
});
