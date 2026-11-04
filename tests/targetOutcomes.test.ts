// S5/P4 — MEASURING A TARGET, which is not measuring a finding.
//
// THE BUG THIS FILE EXISTS TO PREVENT is one the founder's first P2
// live check already produced once, in a different place: a measure
// that reads the same number twice and reports "unchanged". A target
// goal's `source_key` is `target:<funnel>:<from>_to_<to>`. Read as a
// finding type it would count "open findings of type target:..." —
// zero before, zero after, delta 0, verdict "unchanged" — and the whole
// 90-day strategy would report that nothing it did made any difference.
//
// So the target branch is pinned from both ends: that it measures by
// the step's RATE, and that it does NOT fall through to the finding
// count.

import { describe, it, expect, vi, afterEach } from "vitest";
import { code } from "./helpers/source";

afterEach(() => vi.restoreAllMocks());

const TODAY = "2026-12-02";
const TARGET_KEY = "target:website_to_enquiry:product_view_to_enquiry";

/**
 * The funnel's rate, through a mocked diagnosis.
 *
 * `null` makes loadDiagnosis throw, which is the unreadable-funnel case
 * rather than a rate of zero — the distinction the whole module turns
 * on.
 */
let rateNow: number | null = 20;
let stepPresent = true;
vi.mock("@/lib/strategy/diagnosis", () => ({
  WINDOW_DAYS: 90,
  loadDiagnosis: async () => {
    if (rateNow === null) throw new Error("page_events is down");
    return {
      window: { days: 90, from: "2026-09-03", to: TODAY, label: "the last 90 days" },
      models: [],
      funnels: [
        {
          name: "Website to enquiry",
          steps: stepPresent
            ? [
                { key: "visit", label: "Visited", count: 400, fromPrevious: null },
                { key: "product_view", label: "Looked at a product", count: 120, fromPrevious: 30 },
                { key: "enquiry", label: "Asked a question", count: 24, fromPrevious: rateNow },
              ]
            : [{ key: "visit", label: "Visited", count: 400, fromPrevious: null }],
          weakest: null,
          thin: null,
        },
      ],
      sources: [],
      sourcesThin: null,
      atRisk: { count: 0, total: 0, names: [] },
      paid: null,
      gaps: [],
    };
  },
}));

import { funnelRateFor } from "@/lib/growth/recordDecision";
import { outcomeFor, type DueDecision } from "@/lib/growth/resultsJob";

/** goals + opportunities, enough for goalKeyFor and the fall-through. */
function db(seed: { goals?: any[]; opportunities?: any[] } = {}, errors: Record<string, string> = {}) {
  const tables: Record<string, any[]> = {
    goals: seed.goals ?? [{ id: "g1", source_key: TARGET_KEY }],
    opportunities: seed.opportunities ?? [],
  };
  const client = {
    from(table: string) {
      const filters: Record<string, any> = {};
      const rows = () => (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const apply = () =>
        errors[`${table}:select`] ? { data: null, error: { message: errors[`${table}:select`] } } : { data: rows(), error: null };
      const chain: any = {
        select: () => chain,
        eq(c: string, v: any) { filters[c] = v; return chain; },
        maybeSingle: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
        then: (resolve: any) => resolve(apply()),
      };
      return chain;
    },
  };
  return { client, tables };
}

function decision(over: Partial<DueDecision> = {}): DueDecision {
  return {
    id: "dec1",
    dealership_id: "d1",
    kind: "goal_confirmed",
    what: 'Confirmed the goal "Improve Looked at a product to Asked a question"',
    measure: "the rate from Looked at a product to Asked a question",
    baseline: 12.5,
    check_date: TODAY,
    created_at: "2026-11-04T04:00:00.000Z",
    goal_id: "g1",
    opportunity_id: null,
    ...over,
  };
}

describe("1. funnelRateFor reads one number, and says nothing when it cannot", () => {
  it("returns the rate of the step the key names", async () => {
    rateNow = 20;
    stepPresent = true;
    expect(await funnelRateFor(db().client, "d1", TARGET_KEY)).toBe(20);
  });

  it("NULL, NEVER ZERO, WHEN THE FUNNEL CANNOT BE READ", async () => {
    // Zero is a real rate — "none of them got through". Returning it on
    // a failed read would turn an unreadable funnel into a measured
    // disaster, and the monthly review would report it as one.
    rateNow = null;
    expect(await funnelRateFor(db().client, "d1", TARGET_KEY)).toBeNull();
  });

  it("AND NULL WHEN THE STEP IS NO LONGER IN THE FUNNEL", async () => {
    rateNow = 20;
    stepPresent = false;
    expect(await funnelRateFor(db().client, "d1", TARGET_KEY)).toBeNull();
  });

  it("and null for a key that is not a target key at all", async () => {
    rateNow = 20;
    stepPresent = true;
    expect(await funnelRateFor(db().client, "d1", "pages_without_search_title")).toBeNull();
  });
});

describe("2. A TARGET IS MEASURED BY ITS STEP'S RATE", () => {
  it("12.5% UP TO 20% IS AN IMPROVEMENT, counted, and only partly attributable", async () => {
    rateNow = 20;
    stepPresent = true;
    const row = await outcomeFor(db().client, decision(), TODAY);
    expect(row.measuredBefore).toBe(12.5);
    expect(row.measuredAfter).toBe(20);
    expect(row.verdict).toBe("improved");
    expect(row.confidence).toBe("counted");
    // A funnel rate moves for every reason a business moves. The goal
    // is about this step; the step is not about the goal.
    expect(row.attribution).toBe("partial");
    expect(row.whyNotMeasurable).toBeNull();
  });

  it("A RATE THAT FELL IS A WORSENING, not an improvement", async () => {
    // The direction matters here in the opposite way to a finding
    // count: for a rate, up is better. A direction-blind comparison
    // would have called this one right and every finding wrong.
    rateNow = 8;
    stepPresent = true;
    const row = await outcomeFor(db().client, decision(), TODAY);
    expect(row.verdict).toBe("worsened");
    expect(row.measuredAfter).toBe(8);
  });

  it("IT IS NEVER MEASURED AS 'OPEN FINDINGS OF TYPE target:...'", async () => {
    // THE WHOLE POINT OF THE BRANCH. The opportunities table is empty
    // here, so the finding-count path would read 0 and 0 and record
    // "unchanged" over a step that in fact nearly doubled.
    rateNow = 20;
    stepPresent = true;
    const { client } = db({ opportunities: [] });
    const row = await outcomeFor(client, decision(), TODAY);
    expect(row.verdict).not.toBe("unchanged");
    expect(row.measuredAfter).not.toBe(0);
    expect(row.attribution).not.toBe("direct");
  });

  it("AN UNREADABLE FUNNEL IS not_measurable WITH ITS REASON, never a silent skip", async () => {
    rateNow = null;
    const row = await outcomeFor(db().client, decision(), TODAY);
    expect(row.verdict).toBe("not_measurable");
    expect(row.whyNotMeasurable).toMatch(/enough traffic/);
    expect(row.measuredAfter).toBeNull();
  });

  it("AND A TARGET WITH NO BASELINE SAYS SO IN ITS OWN WORDS", async () => {
    // "this step's rate", not "this measure": the reason is read by a
    // person, and the two cases need telling apart.
    rateNow = 20;
    stepPresent = true;
    const row = await outcomeFor(db().client, decision({ baseline: null }), TODAY);
    expect(row.verdict).toBe("not_measurable");
    expect(row.whyNotMeasurable).toMatch(/what this step's rate was before/);
  });

  it("a goal that is NOT a target still goes down the finding path", async () => {
    // The branch must not swallow everything else. This goal's key is
    // a finding type, and the honest answer with an empty findings
    // table is a measured zero, not the target branch's reason.
    rateNow = 20;
    stepPresent = true;
    const { client } = db({
      goals: [{ id: "g1", source_key: "pages_without_search_title" }],
      opportunities: [],
    });
    const row = await outcomeFor(client, decision({ baseline: 3 }), TODAY);
    expect(row.attribution).toBe("direct");
    expect(row.measuredAfter).toBe(0);
    expect(row.verdict).toBe("improved");
  });
});

describe("3. THE SAME RATE IS READ ON BOTH SIDES OF THE DECISION", () => {
  it("THE CONFIRM ROUTE TAKES A TARGET'S BASELINE FROM THE FUNNEL, NOT THE FINDINGS", () => {
    const src = code("src/app/api/goals/[id]/confirm/route.ts");
    expect(src).toMatch(/isTargetKey\(goal\.source_key\)/);
    expect(src).toMatch(/funnelRateFor\(/);
    expect(src).toMatch(/measureForTarget\(/);
  });

  it("AND IT READS IT BEFORE IT ACTIVATES THE GOAL", () => {
    // Same rule as the finding baseline: nothing after the action can
    // see the state the owner decided against.
    const src = code("src/app/api/goals/[id]/confirm/route.ts");
    const reads = src.indexOf("funnelRateFor(");
    const activates = src.indexOf('status: "active"');
    expect(reads).toBeGreaterThan(-1);
    expect(activates).toBeGreaterThan(-1);
    expect(reads).toBeLessThan(activates);
  });

  it("and the job and the route read it through the SAME function", () => {
    // One description of one fact, so the two sides cannot disagree —
    // the reason openFindingsOfType is shared, applied to the rate.
    expect(code("src/lib/growth/resultsJob.ts")).toMatch(/funnelRateFor\(/);
    expect(code("src/app/api/goals/[id]/confirm/route.ts")).toMatch(/funnelRateFor\(/);
  });
});
