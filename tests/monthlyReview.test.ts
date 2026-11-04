// S5/P5 — THE MONTHLY REVIEW.
//
// What was decided, and what came of it. The daily report is about
// today; this is the only email that can say anything about a month,
// and it is therefore the email where "it worked" would be easiest to
// say and least defensible.
//
// THE THREE PROPERTIES THESE TESTS HOLD DOWN:
//
//   1. no figure reaches the owner that nothing counted — the daily
//      report's digit walk, applied to a different email
//   2. "we could not tell" is reported as loudly as "it improved", and
//      is never counted among the results
//   3. a measure that moves for other reasons says so in words, because
//      a monthly review is exactly where a correlation gets promoted to
//      a cause

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import {
  LOOKBACK_DAYS,
  RESULTS_SHOWN,
  UNMEASURED_SHOWN,
  buildMonthlyReview,
  isFirstOfMonth,
  isResultBlock,
  monthWindowFor,
  prunedReview,
  reviewSubject,
  runMonthlyReview,
  type ReviewDecision,
  type ReviewOutcome,
} from "@/lib/growth/monthlyReview";
import { everyNumberIsCounted, renderText, withoutUncountedBlocks } from "@/lib/growth/report";
import { GROUPS } from "@/lib/automation/cronGroups";
import { code } from "./helpers/source";

const sends: { to: string; subject: string; body: string; options: any }[] = [];
vi.mock("@/lib/email/sendDealerEmail", () => ({
  ownerEmail: async (ownerId: string | null) => (ownerId ? "owner@example.test" : null),
  sendDealerEmail: async (_s: any, _d: string, to: string, subject: string, body: string, options: any) => {
    sends.push({ to, subject, body, options });
    return { ok: true };
  },
}));

afterEach(() => {
  sends.length = 0;
  vi.restoreAllMocks();
});

/** 1 November 2026, 09:30 IST — the morning the first review would go. */
const NOW = new Date("2026-11-01T04:00:00.000Z");
const DAY = "2026-11-01";
const OCTOBER = monthWindowFor(DAY)!;

function decision(over: Partial<ReviewDecision> = {}): ReviewDecision {
  return {
    id: "dec1",
    what: 'Confirmed the goal "Give every page a search title"',
    measure: "open findings of type pages_without_search_title",
    check_date: "2026-10-28",
    created_at: "2026-10-01T06:00:00.000Z",
    ...over,
  };
}

function outcome(over: Partial<ReviewOutcome> = {}): ReviewOutcome {
  return {
    decision_id: "dec1",
    measured_at: "2026-10-28T06:00:00.000Z",
    measured_before: 5,
    measured_after: 2,
    verdict: "improved",
    attribution: "direct",
    why_not_measurable: null,
    ...over,
  };
}

function build(decisions: ReviewDecision[], outcomes: ReviewOutcome[]) {
  return buildMonthlyReview({
    dealershipId: "d1",
    day: DAY,
    businessName: "A Business",
    window: OCTOBER,
    decisions,
    outcomes,
  });
}

describe("1. the month it is about", () => {
  it("IS THE MONTH THAT JUST ENDED, and its length is counted not guessed", () => {
    expect(OCTOBER.from).toBe("2026-10-01");
    expect(OCTOBER.until).toBe("2026-11-01");
    expect(OCTOBER.days).toBe(31);
    expect(OCTOBER.label).toBe("October");
  });

  it("CROSSES THE YEAR, which is where a month subtraction usually breaks", () => {
    const december = monthWindowFor("2027-01-01")!;
    expect(december.from).toBe("2026-12-01");
    expect(december.until).toBe("2027-01-01");
    expect(december.label).toBe("December");
    expect(december.days).toBe(31);
  });

  it("AND KNOWS FEBRUARY FROM A LEAP FEBRUARY", () => {
    expect(monthWindowFor("2026-03-01")!.days).toBe(28);
    expect(monthWindowFor("2028-03-01")!.days).toBe(29);
  });

  it("THE LABEL CARRIES NO YEAR, because a year is a digit nothing counted", () => {
    // Every digit in the email's body must be a declared counted value.
    // A year is neither counted nor about the business, so putting it in
    // the body would get the block pruned by the rule that exists to
    // catch invented numbers. The email is dated; the month is named.
    for (const day of ["2026-11-01", "2027-01-01", "2026-03-01"]) {
      expect(monthWindowFor(day)!.label).not.toMatch(/\d/);
    }
  });

  it("runs on the first and on no other day", () => {
    expect(isFirstOfMonth("2026-11-01")).toBe(true);
    expect(isFirstOfMonth("2026-11-02")).toBe(false);
    expect(isFirstOfMonth("2026-11-30")).toBe(false);
    expect(monthWindowFor("not a date")).toBeNull();
  });
});

describe("2. EVERY FIGURE IN IT TRACES TO SOMETHING COUNTED", () => {
  it("THE DIGIT WALK PASSES, SO NOTHING IS PRUNED", () => {
    const review = build([decision()], [outcome()]);
    const check = everyNumberIsCounted(review);
    expect(check.offenders).toEqual([]);
    expect(withoutUncountedBlocks(review).removed).toEqual([]);
  });

  it("A DECISION'S OWN FIGURES ARE NOT REPRINTED, so its result survives", () => {
    // "Acted on: 5 pages have no search title" — the 5 was counted by
    // the audit two months ago, not by this email, and the digit walk
    // compares by VALUE. Printing it would prune the whole result, so
    // the owner would lose the result to a rule meant to protect him.
    const review = build(
      [decision({ what: "Acted on: 5 pages have no search title" })],
      [outcome({ measured_before: 5, measured_after: 0 })]
    );
    expect(everyNumberIsCounted(review).offenders).toEqual([]);
    const text = renderText(review);
    expect(text).toContain("Acted on: pages have no search title");
    expect(text).toContain("went from 5 to 0");
  });

  it("AND A MEASURE WITH A FIGURE IN IT IS TREATED THE SAME WAY", () => {
    const review = build(
      [decision({ measure: "open findings of type 2_step_checkout" })],
      [outcome({ measured_before: 4, measured_after: 4, verdict: "unchanged" })]
    );
    expect(everyNumberIsCounted(review).offenders).toEqual([]);
    expect(renderText(review)).not.toContain("2_step_checkout");
  });

  it("the before and after ARE declared, because this email read them", () => {
    const review = build([decision()], [outcome({ measured_before: 5, measured_after: 2 })]);
    const result = review.blocks.find(isResultBlock)!;
    expect(result.kind === "line" && result.numbers.map((n) => n.value)).toEqual([5, 2]);
  });
});

describe("3. 'WE COULD NOT TELL' IS NOT 'IT HAD NO EFFECT'", () => {
  it("AN UNMEASURABLE OUTCOME GETS ITS OWN LINE, WITH THE REASON", () => {
    const review = build(
      [decision({ what: "Approved: send the October offer" })],
      [outcome({ verdict: "not_measurable", measured_before: null, measured_after: null, why_not_measurable: "this product does not collect how many people opened it" })]
    );
    const text = renderText(review);
    expect(text).toContain("could not be measured: this product does not collect how many people opened it");
    expect(everyNumberIsCounted(review).offenders).toEqual([]);
  });

  it("AND IS NEVER COUNTED AMONG THE RESULTS", () => {
    // The subject and the "results measured" line would otherwise
    // report a month of measurement that did not happen.
    const review = build(
      [decision(), decision({ id: "dec2", what: "Approved: a thing" })],
      [
        outcome(),
        outcome({ decision_id: "dec2", verdict: "not_measurable", measured_before: null, measured_after: null, why_not_measurable: "no subject was recorded" }),
      ]
    );
    expect(review.blocks.filter(isResultBlock)).toHaveLength(1);
    expect(review.counted.find((c) => c.label === "that could not be measured")!.value).toBe(1);
    expect(review.subject).toBe("A Business — your October review: 2 results");
  });

  it("A REASON THAT WAS NEVER RECORDED SAYS THAT, rather than nothing", () => {
    const review = build([decision()], [outcome({ verdict: "not_measurable", measured_before: null, measured_after: null, why_not_measurable: null })]);
    expect(renderText(review)).toContain("no reason was recorded");
  });

  it("and at most a few of them are written out", () => {
    const decisions = Array.from({ length: UNMEASURED_SHOWN + 3 }, (_, i) => decision({ id: `d${i}`, what: `Approved: thing ${"x".repeat(i)}` }));
    const outcomes = decisions.map((d) =>
      outcome({ decision_id: d.id, verdict: "not_measurable", measured_before: null, measured_after: null, why_not_measurable: "no subject was recorded" })
    );
    const review = build(decisions, outcomes);
    const written = review.blocks.filter((b) => b.kind === "line" && b.text.includes("could not be measured"));
    expect(written).toHaveLength(UNMEASURED_SHOWN);
    // AND THE COUNT STILL TELLS THE TRUTH about how many there were.
    expect(review.counted.find((c) => c.label === "that could not be measured")!.value).toBe(UNMEASURED_SHOWN + 3);
  });
});

describe("4. A MEASURE THAT MOVES FOR OTHER REASONS SAYS SO", () => {
  it("PARTIAL ATTRIBUTION CARRIES THE CAVEAT, IN WORDS", () => {
    // S5/P4's target outcomes are all `partial`: a funnel rate moves
    // for every reason a business moves. Without this sentence the
    // review reads as proof, which is the one thing an outcome row is
    // not.
    const review = build(
      [decision({ what: 'Confirmed the goal "Improve Looked at a product to Asked a question"', measure: "the rate from Looked at a product to Asked a question" })],
      [outcome({ measured_before: 12.5, measured_after: 20, attribution: "partial" })]
    );
    const text = renderText(review);
    expect(text).toContain("went from 12.5 to 20");
    expect(text).toContain("not proof that the work caused it");
    expect(everyNumberIsCounted(review).offenders).toEqual([]);
  });

  it("AND DIRECT ATTRIBUTION DOES NOT, because the thing measured IS the thing decided", () => {
    const review = build([decision()], [outcome({ attribution: "direct" })]);
    expect(renderText(review)).not.toContain("not proof that the work caused it");
  });

  it("no attribution at all is caveated too", () => {
    const review = build([decision()], [outcome({ attribution: "none" })]);
    expect(renderText(review)).toContain("not proof that the work caused it");
  });

  it("THE VERDICT IS STATED IN THE OWNER'S WORDS, not as a code", () => {
    expect(renderText(build([decision()], [outcome({ verdict: "improved" })]))).toContain("Better than before");
    expect(renderText(build([decision()], [outcome({ measured_before: 2, measured_after: 2, verdict: "unchanged" })]))).toContain("No change");
    expect(renderText(build([decision()], [outcome({ measured_before: 2, measured_after: 5, verdict: "worsened" })]))).toContain("Worse than before");
  });
});

describe("5. WHAT BELONGS TO THE MONTH, AND WHAT DOES NOT", () => {
  it("A DECISION FROM ANOTHER MONTH IS NOT COUNTED AS DECIDED IN THIS ONE", () => {
    const review = build(
      [
        decision({ id: "sept", created_at: "2026-09-30T18:00:00.000Z" }),
        decision({ id: "oct", created_at: "2026-10-02T06:00:00.000Z" }),
        decision({ id: "nov", created_at: "2026-11-01T01:00:00.000Z" }),
      ],
      []
    );
    expect(review.counted.find((c) => c.label === "decisions recorded")!.value).toBe(1);
  });

  it("BUT ITS RESULT STILL COUNTS, if that is when it was measured", () => {
    // The interesting case, and the one a naive "decisions made this
    // month" review would lose: decided in September, came due in
    // October. That IS what came of the month.
    const review = build(
      [decision({ id: "sept", created_at: "2026-09-02T06:00:00.000Z" })],
      [outcome({ decision_id: "sept", measured_at: "2026-10-01T06:00:00.000Z" })]
    );
    expect(review.counted.find((c) => c.label === "decisions recorded")!.value).toBe(0);
    expect(review.counted.find((c) => c.label === "results measured")!.value).toBe(1);
  });

  it("AND A RESULT MEASURED AFTER THE MONTH ENDED IS NOT IN IT", () => {
    const review = build([decision()], [outcome({ measured_at: "2026-11-01T02:00:00.000Z" })]);
    expect(review.counted.find((c) => c.label === "results measured")!.value).toBe(0);
    expect(review.blocks.filter(isResultBlock)).toEqual([]);
  });

  it("THE MONTH ENDS AT MIDNIGHT IN INDIA, NOT IN UTC", () => {
    // THE BOUNDARY, AND IT WAS WRONG IN THE FIRST VERSION. The window
    // is a run of IST days and the timestamps are UTC, so the first
    // version's string comparison was out by five and a half hours at
    // each end: 00:00 IST on 1 November is 18:30 UTC on 31 October,
    // and a decision taken then belongs to November.
    const firstMomentOfNovember = "2026-10-31T18:30:00.000Z";
    const lastMomentOfOctober = "2026-10-31T18:29:59.000Z";
    const after = build([decision({ created_at: firstMomentOfNovember })], []);
    expect(after.counted.find((c) => c.label === "decisions recorded")!.value).toBe(0);
    const inside = build([decision({ created_at: lastMomentOfOctober })], []);
    expect(inside.counted.find((c) => c.label === "decisions recorded")!.value).toBe(1);
    // And the same at the other end: 00:00 IST on 1 October.
    const firstMomentOfOctober = "2026-09-30T18:30:00.000Z";
    expect(
      build([decision({ created_at: firstMomentOfOctober })], []).counted.find((c) => c.label === "decisions recorded")!.value
    ).toBe(1);
    expect(
      build([decision({ created_at: "2026-09-30T18:29:59.000Z" })], []).counted.find((c) => c.label === "decisions recorded")!.value
    ).toBe(0);
  });

  it("AND A TIMESTAMP NOBODY CAN READ IS IN NO MONTH AT ALL", () => {
    const review = build([decision({ created_at: "sometime last week" })], [outcome({ measured_at: "" })]);
    expect(review.counted.find((c) => c.label === "decisions recorded")!.value).toBe(0);
    expect(review.counted.find((c) => c.label === "results measured")!.value).toBe(0);
  });

  it("AN OUTCOME FOR SOMEBODY ELSE'S DECISION IS IGNORED", () => {
    // The outcomes read comes back keyed by decision id, and only the
    // decisions this business has were asked for. A row that does not
    // match one of them has no business being rendered.
    const review = build([decision()], [outcome({ decision_id: "not-ours" })]);
    expect(review.counted.find((c) => c.label === "results measured")!.value).toBe(0);
  });

  it("STILL WAITING MEANS NO OUTCOME YET, not merely a future date", () => {
    // A decision whose check date has passed and has no outcome row is
    // waiting on the results job rather than on time — and from the
    // owner's side both are "not answered yet".
    const review = build(
      [
        decision({ id: "answered" }),
        decision({ id: "future", check_date: "2026-11-28" }),
        decision({ id: "overdue", check_date: "2026-10-20" }),
      ],
      [outcome({ decision_id: "answered" })]
    );
    expect(review.counted.find((c) => c.label === "still waiting for an answer")!.value).toBe(2);
  });

  it("and at most a few results are written out, however many there were", () => {
    const decisions = Array.from({ length: RESULTS_SHOWN + 2 }, (_, i) => decision({ id: `d${i}` }));
    const outcomes = decisions.map((d) => outcome({ decision_id: d.id }));
    const review = build(decisions, outcomes);
    expect(review.blocks.filter(isResultBlock)).toHaveLength(RESULTS_SHOWN);
    expect(review.counted.find((c) => c.label === "results measured")!.value).toBe(RESULTS_SHOWN + 2);
  });
});

describe("6. A MONTH IN WHICH NOTHING HAPPENED SAYS SO", () => {
  it("NOTHING DECIDED AND NOTHING MEASURED IS A RESULT, stated plainly", () => {
    // A month this product spent doing nothing measurable is a month
    // the owner should hear about. An email that quietly omitted it
    // would be the silence of 3 November with a longer interval.
    const review = build([], []);
    const text = renderText(review);
    expect(text).toContain("Nothing was decided in October");
    expect(text).toMatch(/nothing was measured|nothing came due/);
    expect(review.subject).toBe("A Business — your October review");
    expect(everyNumberIsCounted(review).offenders).toEqual([]);
  });

  it("AND SAYS WHEN SOMETHING IS STILL WAITING, rather than 'nothing is happening'", () => {
    const review = build([decision({ created_at: "2026-09-02T06:00:00.000Z", check_date: "2026-11-28" })], []);
    expect(renderText(review)).toContain("still waiting for their check date");
  });

  it("the subject counts results, and counts one as one", () => {
    expect(reviewSubject("A Business", OCTOBER, 0)).toBe("A Business — your October review");
    expect(reviewSubject("A Business", OCTOBER, 1)).toBe("A Business — your October review: 1 result");
    expect(reviewSubject("A Business", OCTOBER, 4)).toBe("A Business — your October review: 4 results");
  });

  it("AND PRUNING RECOMPUTES IT WITHOUT TURNING IT INTO THE DAILY REPORT'S", () => {
    // withoutUncountedBlocks rewrites the subject, because the subject
    // describes what is in the email and the email just changed. Its
    // default wording is the daily report's, so without the hook this
    // review's subject would become "your daily check, nothing to
    // flag" the first time a block was pruned.
    const review = build([decision(), decision({ id: "dec2" })], [outcome(), outcome({ decision_id: "dec2" })]);
    const firstResult = review.blocks.findIndex(isResultBlock);
    const broken = {
      ...review,
      blocks: review.blocks.map((b, i) => (i === firstResult && b.kind === "line" ? { ...b, numbers: [] } : b)),
    };
    const { report, removed } = prunedReview(broken, "A Business", OCTOBER);
    expect(removed).toHaveLength(1);
    expect(report.subject).toBe("A Business — your October review: 1 result");
    expect(report.subject).not.toContain("daily check");
  });
});

describe("7. the run, and the three ways it must not go quiet", () => {
  function db(seed: { decisions?: any[]; outcomes?: any[] } = {}, errors: Record<string, string> = {}) {
    const tables: Record<string, any[]> = {
      decisions: seed.decisions ?? [],
      outcomes: seed.outcomes ?? [],
      dealerships: [{ id: "d1", dealership_name: "A Business", owner_id: "u1" }],
    };
    const client = {
      from(table: string) {
        const filters: Record<string, any> = {};
        let inList: { col: string; values: any[] } | null = null;
        const rows = () =>
          (tables[table] ?? [])
            .filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
            .filter((r) => (inList ? inList.values.includes(r[inList.col]) : true));
        const apply = () =>
          errors[`${table}:select`] ? { data: null, error: { message: errors[`${table}:select`] } } : { data: rows(), error: null };
        const chain: any = {
          select: () => chain,
          eq(c: string, v: any) { filters[c] = v; return chain; },
          gte: () => chain,
          in(c: string, v: any[]) { inList = { col: c, values: v }; return chain; },
          maybeSingle: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
          then: (resolve: any) => resolve(apply()),
        };
        return chain;
      },
    };
    return { client, tables };
  }

  const row = (over: any = {}) => ({ dealership_id: "d1", ...decision(), ...over });

  it("SENDS ON THE FIRST, ONCE, KEYED TO THE MONTH", async () => {
    const { client } = db({ decisions: [row()], outcomes: [{ ...outcome() }] });
    const r = await runMonthlyReview(client, "d1", { now: NOW });
    expect(r.sent).toBe(true);
    expect(r.month).toBe("October");
    expect(r.results).toBe(1);
    expect(sends).toHaveLength(1);
    expect(sends[0].subject).toBe("A Business — your October review: 1 result");
    // ONE REVIEW PER MONTH. The dispatcher really re-enters a run whose
    // invocation ran out of time.
    expect(sends[0].options.idempotencyKey).toBe("monthly-review-d1-2026-10");
  });

  it("AND DOES NOTHING AT ALL ON ANY OTHER DAY", async () => {
    const { client } = db({ decisions: [row()] });
    const r = await runMonthlyReview(client, "d1", { now: new Date("2026-11-02T04:00:00.000Z") });
    expect(r.skipped).toBe("not the first of the month");
    expect(r.sent).toBe(false);
    expect(r.error).toBeUndefined();
    expect(sends).toEqual([]);
  });

  it("A FAILED DECISIONS READ SETS error, SO THE JOB IS RECORDED AS FAILED", async () => {
    // dailyJobs.ts marks a job failed only on a truthy `error`. S5/P2
    // shipped without that key and every failed run was recorded as
    // "done" — the silent-failure pattern inside the stage built to
    // stop it.
    const { client } = db({}, { "decisions:select": "connection reset" });
    const r = await runMonthlyReview(client, "d1", { now: NOW });
    expect(r.error).toMatch(/could not read decisions/);
    expect(r.sent).toBe(false);
    expect(sends).toEqual([]);
  });

  it("AND A FAILED OUTCOMES READ IS NOT A MONTH IN WHICH NOTHING WAS MEASURED", async () => {
    // The worst of the three: an email telling him nothing came of his
    // work, when the rows exist and could not be read.
    const { client } = db({ decisions: [row()] }, { "outcomes:select": "timeout" });
    const r = await runMonthlyReview(client, "d1", { now: NOW });
    expect(r.error).toMatch(/could not read outcomes/);
    expect(r.sent).toBe(false);
    expect(sends).toEqual([]);
  });

  it("no owner email is a skip, not a failure", async () => {
    const { client, tables } = db({ decisions: [row()] });
    tables.dealerships[0].owner_id = null;
    const r = await runMonthlyReview(client, "d1", { now: NOW });
    expect(r.skipped).toBe("no owner email on record");
    expect(r.error).toBeUndefined();
    expect(sends).toEqual([]);
  });

  it("and a dry run builds the whole thing and sends nothing", async () => {
    const { client } = db({ decisions: [row()], outcomes: [{ ...outcome() }] });
    const r = await runMonthlyReview(client, "d1", { now: NOW, dryRun: true });
    expect(r.skipped).toBe("dry run");
    expect(r.review?.blocks.some(isResultBlock)).toBe(true);
    expect(r.reviewSound).toBe(true);
    expect(sends).toEqual([]);
  });

  it("A MONTH WITH NO DECISIONS AT ALL STILL SENDS, and never reads outcomes", async () => {
    // Nothing to key an outcomes read on, and an empty `.in()` list on
    // a uuid column is what broke the results job's first version.
    const { client } = db({}, { "outcomes:select": "this read should never happen" });
    const r = await runMonthlyReview(client, "d1", { now: NOW });
    expect(r.error).toBeUndefined();
    expect(r.sent).toBe(true);
    expect(sends[0].body).toContain("Nothing was decided in October");
  });
});

describe("8. it costs nothing and needs no third cron entry", () => {
  it("IS A SUBSYSTEM IN signals, AFTER decision_results", () => {
    // Vercel Hobby allows exactly two cron entries and both are used.
    // And the order matters: the outcomes measured this morning must be
    // in the review that goes out this morning.
    expect(GROUPS.signals).toContain("monthly_review");
    expect(GROUPS.signals.indexOf("monthly_review")).toBeGreaterThan(GROUPS.signals.indexOf("decision_results"));
    expect(GROUPS.heavy).not.toContain("monthly_review");
  });

  it("AND NO THIRD CRON ENTRY WAS ADDED", () => {
    const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    expect(vercel.crons).toHaveLength(2);
  });

  it("NO MODEL IS CALLED ANYWHERE ON THIS PATH", () => {
    // §6 of the plan: an outcome is counted or it is not_measurable,
    // and the review's prose is templates with counted values put in.
    const src = code("src/lib/growth/monthlyReview.ts");
    expect(src).not.toMatch(/callClaude|generateContent|anthropic|fetch\(/);
  });

  it("AND THE RUN PRUNES THROUGH THAT SAME FUNCTION, not a second copy", () => {
    // The pruning path is defensive — nothing this product can produce
    // today puts an untraceable figure in this email — so this is the
    // one guard here that a source grep protects better than a
    // fixture. prunedReview is tested directly above; this pins that
    // the run uses it.
    const src = code("src/lib/growth/monthlyReview.ts");
    expect(src).toMatch(/= prunedReview\(review, businessName, window\)/);
    expect(src.match(/withoutUncountedBlocks\(/g) ?? []).toHaveLength(1);
  });

  it("and the lookback is bounded, so the read does not grow forever", () => {
    expect(LOOKBACK_DAYS).toBeGreaterThanOrEqual(90);
    expect(code("src/lib/growth/monthlyReview.ts")).toMatch(/\.gte\("created_at", since\)/);
  });
});
