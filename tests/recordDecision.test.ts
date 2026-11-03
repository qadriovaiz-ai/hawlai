// S5/P1 — DECISION ROWS, written where decisions actually happen.
//
// Three places: an approval granted, a goal confirmed, a suggestion
// acted on. One writer, so the three cannot each invent their own shape
// — the same reason requestApproval.ts is the only thing that creates
// an approval record.
//
// THE THREE PROPERTIES THAT MATTER:
//
//   1. a decision row is a record OF an action, never a step IN it. If
//      this write fails the owner's click still stands, and the log
//      says loudly that an outcome row will be missing
//   2. one action is one decision, however many times the button is
//      pressed — /api/approvals/[id] does not refuse a second Approve
//   3. NOTHING INVENTS A FORECAST. expected_effect is nullable by the
//      founder's decision, and none of these three callers has an
//      honest one to give

import { describe, it, expect, vi, afterEach } from "vitest";
import { recordDecision, recordDecisionQuietly } from "@/lib/growth/recordDecision";
import {
  allActionTypes,
  countedActionTypes,
  isMeasurable,
  measureForAction,
  measureForFindingType,
  notCollectedActionTypes,
} from "@/lib/growth/measures";
import { STANDARD_CHECK_DAYS } from "@/lib/growth/outcomes";
import { code } from "./helpers/source";

afterEach(() => vi.restoreAllMocks());

const NOW = new Date("2026-11-03T04:00:00.000Z"); // 09:30 IST

/** A decisions table double that records every write. */
function db(seed: any[] = [], errors: { select?: string; insert?: string } = {}) {
  const rows: any[] = [...seed];
  const inserts: any[] = [];
  const client = {
    from(_table: string) {
      const filters: Record<string, any> = {};
      let contains: any = null;
      let pending: any = null;
      const matches = (r: any) =>
        Object.entries(filters).every(([k, v]) => r[k] === v) &&
        (!contains
          ? true
          : (contains as any[]).every((want) =>
              (Array.isArray(r.why) ? r.why : []).some((has: any) => has.kind === want.kind && has.id === want.id)
            ));
      const apply = () => {
        if (pending) {
          const values = pending;
          pending = null;
          if (errors.insert) return { data: null, error: { message: errors.insert } };
          const row = { id: `dec_${rows.length + 1}`, ...values };
          inserts.push(values);
          rows.push(row);
          return { data: [row], error: null };
        }
        if (errors.select) return { data: null, error: { message: errors.select } };
        return { data: rows.filter(matches), error: null };
      };
      const chain: any = {
        select: () => chain,
        eq(c: string, v: any) { filters[c] = v; return chain; },
        contains(_c: string, v: any) { contains = v; return chain; },
        limit: () => Promise.resolve(apply()),
        insert(v: any) { pending = v; return chain; },
        single: () => { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
        then: (resolve: any) => resolve(apply()),
      };
      return chain;
    },
  };
  return { client, rows, inserts };
}

const goalDecision = {
  dealershipId: "d1",
  kind: "goal_confirmed" as const,
  what: 'Confirmed the goal "Give every page a search title"',
  why: [{ kind: "goal", id: "g1" }],
  measure: measureForFindingType("pages_without_search_title"),
  goalId: "g1",
  decidedBy: "owner",
  now: NOW,
};

describe("1. a decision is recorded with a date to look at it", () => {
  it("WRITES THE ACTION, ITS EVIDENCE, ITS MEASURE AND ITS CHECK DATE", async () => {
    const { client, inserts } = db();
    const r = await recordDecision(client, goalDecision);
    expect(r.ok && r.created).toBe(true);
    expect(inserts[0].kind).toBe("goal_confirmed");
    expect(inserts[0].what).toMatch(/Confirmed the goal/);
    expect(inserts[0].why).toEqual([{ kind: "goal", id: "g1" }]);
    expect(inserts[0].measure).toBe("open findings of type pages_without_search_title");
    expect(inserts[0].goal_id).toBe("g1");
    expect(inserts[0].decided_by).toBe("owner");
  });

  it("AND THE CHECK DATE IS THE STANDARD WAIT, counted from today", async () => {
    const { client, inserts } = db();
    await recordDecision(client, goalDecision);
    // 3 November + 28 days.
    expect(inserts[0].check_date).toBe("2026-12-01");
    expect(STANDARD_CHECK_DAYS).toBe(28);
  });

  it("AND IT INVENTS NO FORECAST", async () => {
    // expected_effect is nullable by the founder's decision of 3
    // November: an owner approving a send is not predicting a number,
    // and filling the column would be this product inventing one.
    const { client, inserts } = db();
    await recordDecision(client, goalDecision);
    expect(inserts[0].expected_effect).toBeNull();
    // And there is no way for a caller to pass one, so none can.
    expect(code("src/lib/growth/recordDecision.ts")).not.toMatch(/expectedEffect/);
  });
});

describe("2. ONE ACTION IS ONE DECISION", () => {
  it("A GOAL CONFIRMED TWICE IS RECORDED ONCE", async () => {
    const { client, inserts } = db();
    const first = await recordDecision(client, goalDecision);
    const second = await recordDecision(client, goalDecision);
    expect(first.ok && first.created).toBe(true);
    expect(second).toEqual({ ok: true, decisionId: "dec_1", created: false });
    expect(inserts).toHaveLength(1);
  });

  it("AND SO IS AN APPROVAL, WHICH HAS NO GOAL AND NO OPPORTUNITY", async () => {
    // /api/approvals/[id] does NOT refuse a second Approve on a row
    // that is already approved: the executor refuses to act twice, but
    // the status is written again. Without the `why` branch this would
    // be two decisions and two outcomes for one action.
    const approval = {
      dealershipId: "d1",
      kind: "approval_granted" as const,
      what: "Approved: Send email",
      why: [{ kind: "pending_approval", id: "ap1" }],
      measure: measureForAction("send_email"),
      decidedBy: "user:u1",
      now: NOW,
    };
    const { client, inserts } = db();
    await recordDecision(client, approval);
    const second = await recordDecision(client, approval);
    expect(second.ok && second.created).toBe(false);
    expect(inserts).toHaveLength(1);
  });

  it("BUT A DIFFERENT APPROVAL IS A DIFFERENT DECISION", async () => {
    const base = {
      dealershipId: "d1",
      kind: "approval_granted" as const,
      what: "Approved: Send email",
      measure: measureForAction("send_email"),
      decidedBy: "user:u1",
      now: NOW,
    };
    const { client, inserts } = db();
    await recordDecision(client, { ...base, why: [{ kind: "pending_approval", id: "ap1" }] });
    await recordDecision(client, { ...base, why: [{ kind: "pending_approval", id: "ap2" }] });
    expect(inserts).toHaveLength(2);
  });

  it("A FAILED READ DOES NOT MEAN 'THERE IS NONE'", async () => {
    // Writing a second row on a hiccup would give one action two
    // outcomes, which is the question migration 215's unique index
    // exists to prevent anybody having to answer.
    const { client, inserts } = db([], { select: "connection reset" });
    const r = await recordDecision(client, goalDecision);
    expect(r).toEqual({ ok: false, error: "connection reset" });
    expect(inserts).toHaveLength(0);
  });
});

describe("3. A DECISION ROW IS A RECORD OF AN ACTION, NEVER A STEP IN IT", () => {
  it("A FAILED WRITE DOES NOT REACH THE OWNER, BUT IS LOUD IN THE LOG", async () => {
    // He is in the middle of something he just did. A bookkeeping
    // failure must not make his click look like it failed — and the log
    // has to say so, because a missing decision row is a missing
    // outcome row and the exit test is about exactly that.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = db([], { insert: "permission denied" });
    await expect(recordDecisionQuietly(client, goalDecision)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toMatch(/no outcome row for it/);
  });

  it("AND NEITHER DOES A THROW", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exploding = { from() { throw new Error("boom"); } };
    await expect(recordDecisionQuietly(exploding, goalDecision)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toMatch(/threw while recording/);
  });

  it("AND EVERY CALL SITE USES THE QUIET FORM", async () => {
    // A call site that used recordDecision directly would hand the
    // owner a 500 for a bookkeeping failure.
    for (const site of [
      "src/app/api/approvals/[id]/route.ts",
      "src/app/api/goals/[id]/confirm/route.ts",
      "src/app/api/opportunities/[id]/route.ts",
    ]) {
      const src = code(site);
      expect(src, site).toMatch(/recordDecisionQuietly\(/);
      expect(src, site).not.toMatch(/await recordDecision\(/);
    }
  });

  it("AND RECORDS ONLY AFTER THE THING ACTUALLY HAPPENED", async () => {
    // A decision row for a goal that failed to activate would be a
    // record of something that did not happen.
    // THE CALL, NOT THE IMPORT. indexOf("recordDecisionQuietly") finds
    // the import at the top of the file, so the first version of this
    // compared the import's position and failed on correct code — the
    // same mistake as grepping a constraint by its name.
    const call = /await recordDecisionQuietly\(/;
    //
    // AND THE THING BEING COMPARED AGAINST HAS TO EXIST. A mutation
    // that DELETED the activation left indexOf at -1, and "the call is
    // after -1" is true of any file — so the comparison said nothing.
    const confirm = code("src/app/api/goals/[id]/confirm/route.ts");
    const activatesFirst = confirm.indexOf("activateError");
    expect(activatesFirst, "the goal activation went away").toBeGreaterThan(-1);
    expect(confirm.search(call)).toBeGreaterThan(activatesFirst);

    const approvals = code("src/app/api/approvals/[id]/route.ts");
    const writesFirst = approvals.indexOf("reviewed_at");
    expect(writesFirst, "the approval status write went away").toBeGreaterThan(-1);
    expect(approvals.search(call)).toBeGreaterThan(writesFirst);
  });
});

describe("4. WHICH DECISIONS GET RECORDED, AND WHICH DO NOT", () => {
  it("A REJECTED APPROVAL IS NOT A DECISION TO MEASURE", async () => {
    // The owner declining to act has no effect to look at in 28 days.
    const src = code("src/app/api/approvals/[id]/route.ts");
    expect(src).toMatch(/if \(status === "approved"\) \{\s*await recordDecisionQuietly/);
  });

  it("AND NEITHER IS A SUGGESTION DISMISSED", async () => {
    // Clearing something off a list is not an action whose effect there
    // is any reason to measure. Recording it would fill the table with
    // decisions that can only come back not_measurable and make the
    // first monthly review read as noise.
    const src = code("src/app/api/opportunities/[id]/route.ts");
    expect(src).toMatch(/if \(status === "completed"\)/);
    expect(src).not.toMatch(/if \(status === "dismissed"\)/);
  });
});

describe("5. THE MEASURE IS HONEST ABOUT WHAT THIS PRODUCT DOES NOT COLLECT", () => {
  it("EVERY ACTION TYPE IS NAMED IN ONE LIST OR THE OTHER", () => {
    // THE GUARD THAT MATTERS. A type in neither would fall to a
    // generic default and make the map look complete when it is not.
    const named = new Set([...countedActionTypes(), ...notCollectedActionTypes()]);
    const missing = allActionTypes().filter((t) => t !== "description" && !named.has(t));
    expect(missing, `action types with no measure decided:\n${missing.join("\n")}`).toEqual([]);
  });

  it("AND A COUNTED MEASURE NAMES THE TABLE ITS NUMBER COMES FROM", () => {
    for (const type of countedActionTypes()) {
      const m = measureForAction(type);
      expect(isMeasurable(m), type).toBe(true);
      expect(m.source, type).toBeTruthy();
    }
  });

  it("AND AN UNCOLLECTED ONE SAYS SO RATHER THAN GUESSING A NUMBER", () => {
    // The metric is still what a person would look at, so the outcome
    // can say exactly what was missing instead of "unknown".
    for (const type of notCollectedActionTypes()) {
      const m = measureForAction(type);
      expect(isMeasurable(m), type).toBe(false);
      expect(m.metric.length, type).toBeGreaterThan(5);
    }
    expect(measureForAction("publish_video")).toEqual({
      metric: "views of this video",
      source: null,
      direction: "up",
    });
  });

  it("AND AN ACTION TYPE NOBODY HAS DECIDED ON IS NOT ASSUMED MEASURABLE", () => {
    const m = measureForAction("some_future_action");
    expect(isMeasurable(m)).toBe(false);
    expect(m.metric).toMatch(/some_future_action/);
  });

  it("A FINDING'S MEASURE NEEDS NO NEW COLLECTION AND NO ATTRIBUTION", () => {
    // Did the thing the goal is about go away? The audit counts open
    // findings of each type every morning.
    const m = measureForFindingType("products_without_image");
    expect(m).toEqual({
      metric: "open findings of type products_without_image",
      source: "opportunities",
      direction: "down",
    });
    expect(isMeasurable(m)).toBe(true);
  });

  it("and a goal the owner wrote himself has nothing counted to point at", () => {
    // No source_key, so no finding type, so the outcome will say so
    // rather than claim a measurement.
    const confirm = code("src/app/api/goals/[id]/confirm/route.ts");
    expect(confirm).toMatch(/goal\.source_key\s*\?\s*measureForFindingType/);
    expect(confirm).toMatch(/source: null/);
  });
});

describe("6. a finding with no evidence still records a decision", () => {
  // THE FOUNDER FOUND THIS, 3 November 2026, and I had told him to
  // expect evidence — having established hours earlier that
  // syncOpportunities writes none. Two producers fill `opportunities`:
  // the growth audit (strategist.ts:134) writes `evidence`, and
  // opportunityAgent does not. So stuck_leads and the other seven
  // arrive with the column at its default '[]'.
  //
  // `why: []` is therefore CORRECT rather than a bug: there was nothing
  // to point at. The decision is still anchored, by opportunity_id,
  // which is the same fact and already has a column — putting it in
  // `why` as well would be one fact in two places, which is what this
  // codebase has paid for six times.

  const noEvidence = {
    dealershipId: "d1",
    kind: "suggestion_acted_on" as const,
    what: "Acted on: 5 leads waiting 2+ days with no follow-up",
    why: [] as { kind: string; id: string }[],
    measure: measureForFindingType("stuck_leads"),
    opportunityId: "o_stuck",
    goalId: null,
    decidedBy: "owner",
    now: NOW,
  };

  it("THE ROW IS WRITTEN, WITH why EMPTY AND THE ANCHOR IN opportunity_id", async () => {
    const { client, inserts } = db();
    const r = await recordDecision(client, noEvidence);
    expect(r.ok).toBe(true);
    expect(inserts[0].why).toEqual([]);
    expect(inserts[0].opportunity_id).toBe("o_stuck");
    expect(inserts[0].measure).toBe("open findings of type stuck_leads");
  });

  it("AND IT IS STILL RECORDED ONLY ONCE", async () => {
    // THE BRANCH I HAD NOT TESTED. Approval idempotency matches on a
    // single `why` pointer; with `why` empty that branch cannot fire,
    // so this relies entirely on opportunity_id — which was true but
    // unproven until the founder's test made it worth proving.
    const { client, inserts } = db();
    await recordDecision(client, noEvidence);
    const second = await recordDecision(client, noEvidence);
    expect(second.ok && second.created).toBe(false);
    expect(inserts).toHaveLength(1);
  });

  it("and a finding that DOES carry evidence keeps it", async () => {
    const { client, inserts } = db();
    await recordDecision(client, {
      ...noEvidence,
      opportunityId: "o_pages",
      why: [
        { kind: "website_page", id: "p1" },
        { kind: "website_page", id: "p2" },
      ],
      measure: measureForFindingType("pages_without_search_title"),
    });
    expect(inserts[0].why).toHaveLength(2);
  });
});
