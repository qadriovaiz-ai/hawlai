// S5's EXIT TEST — S5/P6.
//
// The criterion, from docs/PLAN-CORE-ARCHITECTURE.md:600, word for word:
//
//   > "After 28 days, each executed action has an outcome row"
//
// WHAT THIS TEST CAN AND CANNOT SHOW, said first because the honest
// answer is uncomfortable:
//
//   IT CAN show that an action recorded today produces exactly one
//   outcome row once its check date has passed — the whole chain, with
//   real rows moving between the stages, on a frozen clock. Every
//   branch of "what if it cannot be measured" included.
//
//   IT CANNOT show that the production cron fires on day 28 and writes
//   that row against the live database. Nothing can, until 28 days
//   elapse. The first decisions were recorded on 3 November 2026, so
//   THE LIVE 28-DAY RUN IS UNVERIFIED UNTIL 1 DECEMBER, and the plan
//   says so in those words. A test that claimed otherwise would be the
//   instrument telling a false story, which this project has paid for
//   five times.
//
// THE SHORT CHECK DATE EXISTS FOR EXACTLY THAT GAP: three days, for one
// business, armed by the environment and expiring by itself, so the
// loop can be WATCHED closing this week. It is a second check, not a
// substitute, and §4.3 of the plan says that too.
//
// WHY THIS DRIVES recordDecision RATHER THAN THE THREE ROUTES. That the
// routes call it — with the baseline read BEFORE the action — is pinned
// by recordDecision.test.ts §7, and those tests fail if a route stops.
// From the decision row onward, this is the real chain: the real
// writer, the real results job, the real monthly review, one in-memory
// database between them.

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { code } from "./helpers/source";
import { recordDecision } from "@/lib/growth/recordDecision";
import { runResultsJob } from "@/lib/growth/resultsJob";
import { runMonthlyReview, isResultBlock } from "@/lib/growth/monthlyReview";
import { measureForAction, measureForFindingType } from "@/lib/growth/measures";
import { SHORT_CHECK_DAYS, STANDARD_CHECK_DAYS, checkDateFrom, checkDaysFor } from "@/lib/growth/outcomes";
import { renderText } from "@/lib/growth/report";

const sends: { subject: string; body: string }[] = [];
vi.mock("@/lib/email/sendDealerEmail", () => ({
  ownerEmail: async () => "owner@example.test",
  sendDealerEmail: async (_s: any, _d: string, _to: string, subject: string, body: string) => {
    sends.push({ subject, body });
    return { ok: true };
  },
}));

afterEach(() => {
  sends.length = 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const BUSINESS = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
/** The day the decisions are taken. */
const DECIDED_ON = new Date("2026-11-04T04:00:00.000Z"); // 09:30 IST
const DECIDED_DAY = "2026-11-04";

/**
 * One in-memory database for the whole chain.
 *
 * It is deliberately NOT a fresh double per stage: the point of an exit
 * test is that the rows one stage writes are the rows the next one
 * reads. A stub per stage would prove only that each stage talks to
 * itself.
 */
function db(seed: { opportunities?: any[]; goals?: any[] } = {}) {
  const tables: Record<string, any[]> = {
    decisions: [],
    outcomes: [],
    opportunities: seed.opportunities ?? [],
    goals: seed.goals ?? [],
    dealerships: [
      { id: BUSINESS, dealership_name: "A Business", owner_id: "u1" },
      { id: OTHER, dealership_name: "Another Business", owner_id: "u2" },
    ],
  };
  const client = {
    from(table: string) {
      const filters: Record<string, any> = {};
      let inList: { col: string; values: any[] } | null = null;
      let lte: { col: string; value: any } | null = null;
      let contains: { col: string; want: any[] } | null = null;
      let pending: any = null;

      const matches = (r: any) =>
        Object.entries(filters).every(([k, v]) => r[k] === v) &&
        (!inList || inList.values.includes(r[inList.col])) &&
        (!lte || String(r[lte.col]) <= String(lte.value)) &&
        (!contains ||
          contains.want.every((want: any) =>
            (Array.isArray(r[contains!.col]) ? r[contains!.col] : []).some((has: any) => has.kind === want.kind && has.id === want.id)
          ));

      const rows = () => (tables[table] ?? []).filter(matches);
      const apply = () => {
        if (!pending) return { data: rows(), error: null };
        const values = pending;
        pending = null;
        const row = { id: `${table}-${tables[table].length + 1}`, created_at: new Date().toISOString(), ...values };
        // THE UNIQUE INDEX, MODELLED. migration 215 makes
        // outcomes.decision_id unique, and an exit test that let a
        // second row through would be testing a database this product
        // does not run on.
        if (table === "outcomes" && tables.outcomes.some((o) => o.decision_id === values.decision_id)) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
        tables[table].push(row);
        return { data: [row], error: null };
      };

      const chain: any = {
        select: () => chain,
        eq(c: string, v: any) { filters[c] = v; return chain; },
        in(c: string, v: any[]) { inList = { col: c, values: v }; return chain; },
        lte(c: string, v: any) { lte = { col: c, value: v }; return chain; },
        gte: () => chain,
        contains(c: string, v: any[]) { contains = { col: c, want: v }; return chain; },
        limit: () => Promise.resolve(apply()),
        insert(v: any) { pending = v; return chain; },
        update(v: any) { for (const r of rows()) Object.assign(r, v); return chain; },
        single: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
        maybeSingle: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
        then: (resolve: any) => resolve(apply()),
      };
      return chain;
    },
  };
  return { client, tables };
}

/** Three findings of one type open when the owner acts. */
function threeOpen(type = "pages_without_search_title") {
  return [
    { id: "o1", dealership_id: BUSINESS, type, status: "open" },
    { id: "o2", dealership_id: BUSINESS, type, status: "open" },
    { id: "o3", dealership_id: BUSINESS, type, status: "open" },
  ];
}

describe("1. AN ACTION TAKEN TODAY HAS AN OUTCOME ROW ONCE ITS CHECK DATE HAS PASSED", () => {
  it("THE WHOLE CHAIN, ON A FROZEN CLOCK: decision -> check date -> one outcome", async () => {
    const { client, tables } = db({ opportunities: threeOpen() });

    // The owner acts on a suggestion: three findings of this type were
    // open, and he fixes them all.
    const written = await recordDecision(client, {
      dealershipId: BUSINESS,
      kind: "suggestion_acted_on",
      what: "Acted on: three pages have no search title",
      why: [{ kind: "page", id: "p1" }],
      measure: measureForFindingType("pages_without_search_title"),
      opportunityId: "o1",
      baseline: 3,
      decidedBy: "owner",
      now: DECIDED_ON,
    });
    expect(written.ok && written.created).toBe(true);
    expect(tables.decisions).toHaveLength(1);
    expect(tables.decisions[0].check_date).toBe(checkDateFrom(DECIDED_DAY, STANDARD_CHECK_DAYS));

    // NOTHING HAPPENS BEFORE THE DATE. The day before is still too
    // early, and a job that measured early would report a month's work
    // after a day of it.
    const dayBefore = new Date(Date.parse(`${tables.decisions[0].check_date}T04:00:00.000Z`) - 86_400_000);
    const early = await runResultsJob(client, BUSINESS, { now: dayBefore });
    expect(early.due).toBe(0);
    expect(tables.outcomes).toHaveLength(0);

    // The work landed: the findings are closed.
    for (const row of tables.opportunities) row.status = "completed";

    // The check date arrives.
    const onTheDay = new Date(`${tables.decisions[0].check_date}T04:00:00.000Z`);
    const run = await runResultsJob(client, BUSINESS, { now: onTheDay });
    expect(run.error).toBeUndefined();
    expect(run.due).toBe(1);
    expect(run.written).toBe(1);

    // THE EXIT CRITERION, STATED AS IT IS WRITTEN: each executed action
    // has an outcome row.
    expect(tables.outcomes).toHaveLength(1);
    const outcome = tables.outcomes[0];
    expect(outcome.decision_id).toBe(tables.decisions[0].id);
    expect(outcome.measured_before).toBe(3);
    expect(outcome.measured_after).toBe(0);
    expect(outcome.verdict).toBe("improved");
    expect(outcome.confidence).toBe("counted");
    expect(outcome.attribution).toBe("direct");
    expect(outcome.why_not_measurable).toBeNull();
  });

  it("EVERY DECISION THAT CAME DUE HAS ONE, ACROSS ALL THREE KINDS", async () => {
    // The property, over a set, rather than one happy case. An exit
    // test that checked a single row would pass with two of the three
    // callers broken.
    const { client, tables } = db({
      opportunities: threeOpen(),
      goals: [{ id: "g1", dealership_id: BUSINESS, source_key: "products_without_description", status: "active" }],
    });

    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "suggestion_acted_on",
      what: "Acted on: three pages have no search title",
      why: [{ kind: "page", id: "p1" }],
      measure: measureForFindingType("pages_without_search_title"),
      opportunityId: "o1", baseline: 3, decidedBy: "owner", now: DECIDED_ON,
    });
    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "goal_confirmed",
      what: 'Confirmed the goal "Describe every product"',
      why: [{ kind: "goal", id: "g1" }],
      measure: measureForFindingType("products_without_description"),
      goalId: "g1", baseline: 6, decidedBy: "owner", now: DECIDED_ON,
    });
    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "approval_granted",
      what: "Approved: send the offer",
      why: [{ kind: "approval", id: "a1" }],
      measure: measureForAction("send_email"),
      baseline: null, decidedBy: "owner", now: DECIDED_ON,
    });
    // ANOTHER BUSINESS, ALSO DUE, IN THE FIXTURE ON PURPOSE. Without
    // one the results job's `dealership_id` filter is unreachable:
    // dropping it changed nothing and that mutation survived. With it
    // dropped, this run would answer somebody else's decision.
    await recordDecision(client, {
      dealershipId: OTHER, kind: "approval_granted",
      what: "Approved: somebody else's send",
      why: [{ kind: "approval", id: "a9" }],
      measure: measureForAction("send_email"),
      baseline: null, decidedBy: "owner", now: DECIDED_ON,
    });
    expect(tables.decisions).toHaveLength(4);

    const due = new Date(`${checkDateFrom(DECIDED_DAY, STANDARD_CHECK_DAYS)}T04:00:00.000Z`);
    const run = await runResultsJob(client, BUSINESS, { now: due });

    expect(run.due).toBe(3);
    expect(run.written).toBe(3);
    expect(run.failed).toBe(0);
    const theirs = tables.decisions.find((d) => d.dealership_id === OTHER)!;
    expect(tables.outcomes.some((o) => o.decision_id === theirs.id)).toBe(false);
    // NOT ONE OF THIS BUSINESS'S DECISIONS LEFT WITHOUT A ROW.
    const withOutcome = new Set(tables.outcomes.map((o) => o.decision_id));
    for (const decision of tables.decisions.filter((d) => d.dealership_id === BUSINESS)) {
      expect(withOutcome.has(decision.id), decision.kind).toBe(true);
    }
    expect(tables.outcomes).toHaveLength(3);
  });

  it("AND THE ONES NOBODY COULD MEASURE HAVE A ROW WITH A REASON, not an absence", async () => {
    // "We could not tell" is a different outcome from "it had no
    // effect", and this is the stage that exists to keep them apart.
    const { client, tables } = db();
    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "approval_granted",
      what: "Approved: send the offer",
      why: [{ kind: "approval", id: "a1" }],
      measure: measureForAction("send_email"),
      baseline: null, decidedBy: "owner", now: DECIDED_ON,
    });
    const due = new Date(`${checkDateFrom(DECIDED_DAY, STANDARD_CHECK_DAYS)}T04:00:00.000Z`);
    const run = await runResultsJob(client, BUSINESS, { now: due });

    expect(run.written).toBe(1);
    expect(run.notMeasurable).toBe(1);
    expect(tables.outcomes[0].verdict).toBe("not_measurable");
    expect(String(tables.outcomes[0].why_not_measurable)).toMatch(/does not record which thing/);
    expect(tables.outcomes[0].measured_before).toBeNull();
  });

  it("ONE OUTCOME PER DECISION, HOWEVER MANY TIMES THE JOB RUNS", async () => {
    // The dispatcher really re-enters a run whose invocation ran out of
    // time (dailyJobs.ts), and migration 215's unique index is the last
    // word. A second run must add nothing and report nothing it did
    // not do.
    const { client, tables } = db({ opportunities: threeOpen() });
    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "suggestion_acted_on",
      what: "Acted on: three pages have no search title",
      why: [{ kind: "page", id: "p1" }],
      measure: measureForFindingType("pages_without_search_title"),
      opportunityId: "o1", baseline: 3, decidedBy: "owner", now: DECIDED_ON,
    });
    const due = new Date(`${checkDateFrom(DECIDED_DAY, STANDARD_CHECK_DAYS)}T04:00:00.000Z`);

    const first = await runResultsJob(client, BUSINESS, { now: due });
    const second = await runResultsJob(client, BUSINESS, { now: due });

    expect(first.due).toBe(1);
    expect(first.written).toBe(1);
    // `due` IS WHAT CAME DUE AND STILL HAS NO OUTCOME — resultsJob
    // returns `pending.length`, counted after the ones already
    // answered are taken out. So the second run finding NOTHING left to
    // do is the stronger statement, and the first version of this test
    // asserted the weaker (and wrong) one.
    expect(second.due).toBe(0);
    expect(second.written).toBe(0);
    expect(second.failed).toBe(0);
    expect(second.error).toBeUndefined();
    expect(tables.outcomes).toHaveLength(1);
  });

  it("AND A SECOND CLICK ON THE SAME ACTION IS STILL ONE DECISION", async () => {
    // Which is what makes "one outcome per executed action" true at the
    // other end of the chain: /api/approvals/[id] does not refuse a
    // second Approve.
    const { client, tables } = db();
    const input = {
      dealershipId: BUSINESS, kind: "approval_granted" as const,
      what: "Approved: send the offer",
      why: [{ kind: "approval", id: "a1" }],
      measure: measureForAction("send_email"),
      baseline: null, decidedBy: "owner", now: DECIDED_ON,
    };
    const first = await recordDecision(client, input);
    const again = await recordDecision(client, input);
    expect(first.ok && first.created).toBe(true);
    expect(again.ok && again.created).toBe(false);
    expect(tables.decisions).toHaveLength(1);
  });
});

describe("2. AND THE MONTH'S REVIEW REPORTS EXACTLY WHAT WAS MEASURED", () => {
  it("THE LAST LINK: the rows the job wrote are the rows the email reads", async () => {
    const { client, tables } = db({ opportunities: threeOpen() });
    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "suggestion_acted_on",
      what: "Acted on: three pages have no search title",
      why: [{ kind: "page", id: "p1" }],
      measure: measureForFindingType("pages_without_search_title"),
      opportunityId: "o1", baseline: 3, decidedBy: "owner", now: DECIDED_ON,
      checkInDays: SHORT_CHECK_DAYS,
    });
    for (const row of tables.opportunities) row.status = "completed";

    // MEASURED INSIDE NOVEMBER, which the standard wait would not be:
    // 4 November plus 28 days is 2 December, after the review has
    // already gone out. The short check is exactly what makes a closed
    // loop visible inside the month, and the first version of this test
    // had the arithmetic wrong rather than the product.
    const due = new Date(`${checkDateFrom(DECIDED_DAY, SHORT_CHECK_DAYS)}T04:00:00.000Z`);
    await runResultsJob(client, BUSINESS, { now: due });
    for (const o of tables.outcomes) o.measured_at = due.toISOString();

    // ...and reported on 1 December.
    const review = await runMonthlyReview(client, BUSINESS, { now: new Date("2026-12-01T04:00:00.000Z") });
    expect(review.error).toBeUndefined();
    expect(review.month).toBe("November");
    expect(review.results).toBe(1);
    expect(review.reviewSound).toBe(true);
    expect(review.blocksLeftOut).toBe(0);
    expect(review.review?.blocks.filter(isResultBlock)).toHaveLength(1);
    expect(sends).toHaveLength(1);
    expect(sends[0].body).toContain("went from 3 to 0");
  });
});

describe("3. THE SHORT CHECK DATE — one business, and it expires by itself", () => {
  const ARMED = `2026-11-30:${BUSINESS}`;

  it("PUTS THE NAMED BUSINESS ON A THREE-DAY CHECK", async () => {
    const { client, tables } = db({ opportunities: threeOpen() });
    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "suggestion_acted_on",
      what: "Acted on: three pages have no search title",
      why: [{ kind: "page", id: "p1" }],
      measure: measureForFindingType("pages_without_search_title"),
      opportunityId: "o1", baseline: 3, decidedBy: "owner", now: DECIDED_ON,
      checkInDays: checkDaysFor(BUSINESS, DECIDED_DAY, ARMED),
    });
    expect(tables.decisions[0].check_date).toBe(checkDateFrom(DECIDED_DAY, SHORT_CHECK_DAYS));
    expect(SHORT_CHECK_DAYS).toBe(3);
  });

  it("WITHOUT ANY CALLER ASKING FOR IT — the three routes pass no wait at all", async () => {
    // THE GAP THIS CLOSES, and it was a real one. Every other test here
    // handed `checkInDays` to the writer, so the writer's own call to
    // checkDaysFor never ran: a mutation replacing it with a hardcoded
    // 28 survived. None of the three real callers passes a wait, so
    // this is the only path that matters in production.
    vi.stubEnv("GROWTH_SHORT_CHECK_UNTIL", ARMED);
    const { client, tables } = db({ opportunities: threeOpen() });
    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "suggestion_acted_on",
      what: "Acted on: three pages have no search title",
      why: [{ kind: "page", id: "p1" }],
      measure: measureForFindingType("pages_without_search_title"),
      opportunityId: "o1", baseline: 3, decidedBy: "owner", now: DECIDED_ON,
    });
    expect(tables.decisions[0].check_date).toBe(checkDateFrom(DECIDED_DAY, SHORT_CHECK_DAYS));

    // AND THE BUSINESS NEXT TO IT IS STILL ON TWENTY-EIGHT.
    await recordDecision(client, {
      dealershipId: OTHER, kind: "approval_granted",
      what: "Approved: somebody else's send",
      why: [{ kind: "approval", id: "a9" }],
      measure: measureForAction("send_email"),
      baseline: null, decidedBy: "owner", now: DECIDED_ON,
    });
    const theirs = tables.decisions.find((d) => d.dealership_id === OTHER)!;
    expect(theirs.check_date).toBe(checkDateFrom(DECIDED_DAY, STANDARD_CHECK_DAYS));
  });

  it("AND THE LOOP CLOSES THREE DAYS LATER, not twenty-eight", async () => {
    const { client, tables } = db({ opportunities: threeOpen() });
    await recordDecision(client, {
      dealershipId: BUSINESS, kind: "suggestion_acted_on",
      what: "Acted on: three pages have no search title",
      why: [{ kind: "page", id: "p1" }],
      measure: measureForFindingType("pages_without_search_title"),
      opportunityId: "o1", baseline: 3, decidedBy: "owner", now: DECIDED_ON,
      checkInDays: checkDaysFor(BUSINESS, DECIDED_DAY, ARMED),
    });
    for (const row of tables.opportunities) row.status = "completed";
    const threeDaysLater = new Date("2026-11-07T04:00:00.000Z");
    const run = await runResultsJob(client, BUSINESS, { now: threeDaysLater });
    expect(run.written).toBe(1);
    expect(tables.outcomes[0].verdict).toBe("improved");
  });

  it("A BARE DATE ARMS NOTHING — it would put EVERY business on a three-day check", () => {
    // The lesson GROWTH_COPY_AUDIT_ON learned by being read the evening
    // before a run: dailyJobs.ts runs every subsystem once per
    // dealership, so "a date" means "all of them".
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(checkDaysFor(BUSINESS, DECIDED_DAY, "2026-11-30")).toBe(STANDARD_CHECK_DAYS);
    expect(spy.mock.calls.join(" ")).toMatch(/bare date/);
  });

  it("AND ANOTHER BUSINESS IS NOT TOUCHED BY IT", () => {
    expect(checkDaysFor(OTHER, DECIDED_DAY, ARMED)).toBe(STANDARD_CHECK_DAYS);
  });

  it("AND IT TURNS ITSELF OFF THE DAY AFTER THE DATE", () => {
    // "Remember to turn it off" is not a safeguard. A short check left
    // on is a permanent stream of outcomes measured too early, which
    // this product would then report as results.
    expect(checkDaysFor(BUSINESS, "2026-11-30", ARMED)).toBe(SHORT_CHECK_DAYS);
    expect(checkDaysFor(BUSINESS, "2026-12-01", ARMED)).toBe(STANDARD_CHECK_DAYS);
  });

  it("unset, or set to nonsense, is the standard wait", () => {
    expect(checkDaysFor(BUSINESS, DECIDED_DAY, undefined)).toBe(STANDARD_CHECK_DAYS);
    expect(checkDaysFor(BUSINESS, DECIDED_DAY, "")).toBe(STANDARD_CHECK_DAYS);
    expect(checkDaysFor(BUSINESS, DECIDED_DAY, `whenever:${BUSINESS}`)).toBe(STANDARD_CHECK_DAYS);
  });

  it("AND THE EXIT TEST'S OWN WAIT IS STILL TWENTY-EIGHT DAYS", () => {
    // The criterion is "after 28 days". The short check is a second,
    // visible check for one business — it must not become the default
    // for everybody, which is what a loosened constant here would do.
    expect(STANDARD_CHECK_DAYS).toBe(28);
    expect(checkDaysFor(BUSINESS, DECIDED_DAY)).toBe(28);
  });
});

describe("4. what remains unverified, written down rather than assumed", () => {
  it("THE LIVE 28-DAY RUN CANNOT BE TESTED HERE, and the plan says so", async () => {
    // This is not a test of the product; it is a test that the claim
    // about the product is on the record. A phase whose limits live
    // only in a commit message is a phase somebody later assumes was
    // fully verified.
    const plan = fs.readFileSync("docs/PLAN-S5-OUTCOMES.md", "utf8");
    expect(plan).toMatch(/unverified/i);
    expect(plan).toMatch(/1 December/);
  });

  it("AND NOTHING OUTSIDE THE DATABASE DOUBLE READS THE REAL CLOCK", () => {
    // A test that read the real clock would pass today and fail in
    // December — or worse, the reverse. Every date in the fixtures
    // above is written out or derived from one that is.
    //
    // THE DOUBLE IS EXEMPT, and the first version of this guard was not
    // precise enough to say so: it grepped the whole file for
    // `new Date()`, found the double's own row stamp, and failed. A
    // stamp no assertion depends on is not a clock this test runs on.
    const src = code("tests/s5ExitTest.test.ts");
    const double = src.indexOf("function db(");
    const afterDouble = src.indexOf("function threeOpen(");
    expect(double, "the double moved").toBeGreaterThan(-1);
    expect(afterDouble, "the fixture after the double moved").toBeGreaterThan(double);
    const withoutDouble = src.slice(0, double) + src.slice(afterDouble);
    expect(withoutDouble).not.toMatch(/new Date\(\)/);
  });
});
