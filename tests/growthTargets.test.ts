// S5/P4 — THE 90-DAY STRATEGY'S READY BRANCH.
//
// `maturityOf` has returned "ready" past 14 days and 20 events since S4
// built the thin branch, and until now nothing acted on it: a business
// past the threshold with no approved goal was told "no plan is approved
// yet, so the steps below are setup, not targets" — forever.
//
// THE ONE THING THESE TESTS EXIST TO HOLD DOWN. A target goal carries NO
// TARGET NUMBER. The baseline is today's number, counted; a target is
// tomorrow's, and nothing here can know it. "Take this step from 12% to
// 30%" invents the 30, and an invented number in front of the owner is
// the single thing this product must never do.
//
// It is still measurable, which is the part worth being explicit about:
// measuring needs a MEASURE and a BASELINE, not a target.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MAX_TARGET_GOALS,
  TARGET_KEY_PREFIX,
  isTargetKey,
  parseTargetKey,
  targetGoalsFrom,
  targetKeyFor,
  weakestStepFor,
} from "@/lib/growth/targets";
import { measureForTarget } from "@/lib/growth/measures";
import { buildDailyReport, everyNumberIsCounted, renderText, withoutUncountedBlocks } from "@/lib/growth/report";
import { draftTargetsAreOwn, maturityOf, planLine } from "@/lib/growth/strategy";
import type { Diagnosis, Funnel, FunnelStep } from "@/lib/strategy/diagnosis";
import type { TrackingState } from "@/lib/growth/tracking";
import { code } from "./helpers/source";

afterEach(() => vi.restoreAllMocks());

const NOW = new Date("2026-11-04T04:00:00.000Z");
const DAY = "2026-11-04";

const READY = maturityOf({ firstAt: "2026-09-01T10:00:00Z", events: 55 }, NOW);
const LEARNING = maturityOf({ firstAt: "2026-11-01T10:00:00Z", events: 3 }, NOW);

function step(key: string, label: string, count: number, fromPrevious: number | null): FunnelStep {
  return { key, label, count, fromPrevious };
}

/**
 * A funnel whose weakest step is "product page -> enquiry", at 12.5%.
 *
 * THE LABELS AND THE KEYS DIFFER ON PURPOSE. `label` is the owner's
 * word and changes with the business model; `key` is the machine's.
 * A fixture where they matched would let the key/label mutation
 * survive.
 */
function funnel(over: Partial<Funnel> = {}): Funnel {
  const steps = [
    step("visit", "Visited the site", 400, null),
    step("product_view", "Looked at a product", 120, 30),
    step("enquiry", "Asked a question", 15, 12.5),
  ];
  return {
    name: "Website to enquiry",
    steps,
    weakest: { from: "Looked at a product", to: "Asked a question", fromKey: "product_view", toKey: "enquiry", rate: 12.5, entered: 120 },
    thin: null,
    ...over,
  };
}

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    window: { days: 90, from: "2026-08-06", to: DAY, label: "the last 90 days" },
    models: ["ecommerce" as any],
    funnels: [funnel()],
    sources: [],
    sourcesThin: null,
    atRisk: { count: 0, total: 0, names: [] },
    paid: null,
    gaps: [],
    ...over,
  };
}

describe("1. A TARGET GOAL CARRIES NO TARGET NUMBER", () => {
  it("NAMES THE STEP AND THE RATE IT RUNS AT, AND LEAVES targetValue NULL", () => {
    // The whole phase turns on this. A number here would be a forecast,
    // and `targetMetric` without `targetValue` is how the schema says
    // "this is what we will watch" without saying what it will reach.
    const { goals } = targetGoalsFrom(diagnosis(), READY);
    expect(goals).toHaveLength(1);
    expect(goals[0].targetValue).toBeNull();
    expect(goals[0].targetMetric).toBe("Looked at a product to Asked a question");
    expect(goals[0].description).toContain("12.5%");
    expect(goals[0].description).toContain("120");
  });

  it("passes draftTargetsAreOwn, which S4 wrote and this must not loosen", () => {
    const { goals } = targetGoalsFrom(diagnosis(), READY);
    expect(draftTargetsAreOwn(goals)).toBe(true);
    expect(goals[0].basis.some((b) => b.kind === "counted")).toBe(true);
  });

  it("the source file says why there is no number, so a later tidy-up cannot undo it quietly", () => {
    const src = code("src/lib/growth/targets.ts");
    expect(src).toContain("targetValue: null");
    expect(src).not.toMatch(/targetValue:\s*\d/);
  });
});

describe("2. THE KEY SURVIVES A LABEL CHANGE", () => {
  it("IS BUILT FROM THE STEP KEYS, NOT THE OWNER'S WORDS", () => {
    // A goal keyed on "Looked at a product" would be orphaned the day
    // the business model changes that label — the goal stays, its
    // decisions stay, and nothing can be measured against it again.
    const { goals } = targetGoalsFrom(diagnosis(), READY);
    expect(goals[0].key).toBe(`${TARGET_KEY_PREFIX}website_to_enquiry:product_view_to_enquiry`);
    expect(goals[0].key).not.toContain("looked");
    expect(goals[0].key).not.toContain("asked");
  });

  it("FINDS THE SAME STEP AFTER THE LABELS ARE RENAMED", () => {
    const { goals } = targetGoalsFrom(diagnosis(), READY);
    const renamed = diagnosis({
      funnels: [
        funnel({
          steps: [
            step("visit", "Walked in", 400, null),
            step("product_view", "Browsed the shelf", 120, 30),
            step("enquiry", "Spoke to someone", 15, 12.5),
          ],
          weakest: { from: "Browsed the shelf", to: "Spoke to someone", fromKey: "product_view", toKey: "enquiry", rate: 12.5, entered: 120 },
        }),
      ],
    });
    const found = weakestStepFor(renamed, goals[0].key);
    expect(found?.rate).toBe(12.5);
    expect(found?.from).toBe("Browsed the shelf");
  });

  it("round-trips through parseTargetKey, and refuses a key that is not one", () => {
    expect(parseTargetKey(targetKeyFor("Website to enquiry", "product_view", "enquiry"))).toEqual({
      funnel: "website_to_enquiry",
      fromKey: "product_view",
      toKey: "enquiry",
    });
    expect(isTargetKey("pages_without_search_title")).toBe(false);
    expect(parseTargetKey("pages_without_search_title")).toBeNull();
    expect(parseTargetKey(null)).toBeNull();
  });

  it("A STEP WITH NO RATE IS NOT A STEP TO MEASURE", () => {
    // fromPrevious is null when the previous step was empty. Reading
    // that as a rate of zero would record "none of them got through"
    // about a step nobody entered.
    const d = diagnosis({
      funnels: [funnel({ steps: [step("visit", "Visited", 0, null), step("product_view", "Looked", 0, null), step("enquiry", "Asked", 0, null)] })],
    });
    expect(weakestStepFor(d, `${TARGET_KEY_PREFIX}website_to_enquiry:product_view_to_enquiry`)).toBeNull();
  });
});

describe("3. NO INVENTED TARGET WHEN THERE IS NOTHING TO MEASURE", () => {
  it("RETURNS THE FUNNEL'S OWN 'TOO THIN' SENTENCE INSTEAD OF A GOAL", () => {
    // diagnosis.ts already decides when a step has too little traffic
    // to judge, and says so in its own words. The honest "no target
    // yet" was written months ago; this must not write a second one,
    // and must certainly not offer a target anyway.
    const thin = "No step has 10 people entering it yet, so none can be called the weakest.";
    const { goals, why } = targetGoalsFrom(diagnosis({ funnels: [funnel({ weakest: null, thin })] }), READY);
    expect(goals).toEqual([]);
    expect(why).toBe(thin);
  });

  it("STILL SAYS SOMETHING WHEN EVEN THE THIN SENTENCE IS MISSING", () => {
    const { goals, why } = targetGoalsFrom(diagnosis({ funnels: [funnel({ weakest: null, thin: null })] }), READY);
    expect(goals).toEqual([]);
    expect(String(why ?? "")).not.toBe("");
  });

  it("A LEARNING BUSINESS GETS THE THIN BRANCH'S OWN REASON, AND NO TARGETS", () => {
    const { goals, why } = targetGoalsFrom(diagnosis(), LEARNING);
    expect(goals).toEqual([]);
    expect(why).toBe(LEARNING.why);
  });

  it("caps the list, one per funnel", () => {
    const many = diagnosis({ funnels: [funnel({ name: "A" }), funnel({ name: "B" }), funnel({ name: "C" }), funnel({ name: "D" })] });
    const { goals } = targetGoalsFrom(many, READY);
    expect(goals).toHaveLength(MAX_TARGET_GOALS);
    expect(new Set(goals.map((g) => g.key)).size).toBe(MAX_TARGET_GOALS);
  });
});

describe("4. THE MEASURE IS THE STEP'S RATE, AND IT GOES UP", () => {
  it("names the step, and points at the diagnosis rather than half a table", () => {
    const m = measureForTarget("Looked at a product to Asked a question");
    expect(m.metric).toContain("Looked at a product to Asked a question");
    expect(m.direction).toBe("up");
    // The rate is a ratio of two counts from two tables; naming either
    // one would be naming half of it.
    expect(m.source).toBe("diagnosis");
  });

  it("A RATE IS A MEASURE THAT RISES — the opposite of a finding count", () => {
    // `measureForFindingType` is "fewer is better". If a target's
    // direction were copied from it, every improvement would be
    // recorded as a worsening. verdictFor is direction-aware precisely
    // because of this pair.
    expect(measureForTarget("x").direction).toBe("up");
  });
});

describe("5. EVERY FIGURE A TARGET PRINTS IS DECLARED", () => {
  function tracking(): TrackingState {
    return {
      siteEvents: { firing: true, lastAt: "2026-11-03T10:00:00Z", visitorEvents30d: 55, firstAt: "2026-09-01T10:00:00Z" },
      searchConsole: { connected: true, siteUrl: "https://example.test" },
      adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" },
      health: "ok",
    };
  }

  function reportWithTargets() {
    const { goals, declared } = targetGoalsFrom(diagnosis(), READY);
    return {
      goals,
      report: buildDailyReport({
        dealershipId: "d1",
        day: DAY,
        businessName: "A Business",
        tracking: tracking(),
        maturity: READY,
        counted: [],
        suggestions: [],
        setupGoals: [],
        targetGoals: goals,
        targetNumbers: declared,
        activeGoals: 0,
        findingCount: 0,
      }),
    };
  }

  it("THE DIGIT WALK PASSES, SO THE TARGET BLOCKS ARE NOT PRUNED", () => {
    // 3 November 2026: a whole email was dropped over a "5" nobody had
    // declared. A target's sentence states three counted figures — who
    // entered, what share got through, over how many days — and if
    // targetGoalsFrom stopped declaring them, the owner would get
    // targets silently removed from his email by the very rule that
    // exists to stop invented numbers.
    const { report } = reportWithTargets();
    const check = everyNumberIsCounted(report);
    expect(check.offenders).toEqual([]);
    expect(check.ok).toBe(true);
    expect(withoutUncountedBlocks(report).removed).toEqual([]);
  });

  it("THE TARGET REACHES THE EMAIL, AND IS CALLED A TARGET", () => {
    const { report } = reportWithTargets();
    const targets = report.blocks.filter((b) => b.kind === "setup" && b.isTarget);
    expect(targets).toHaveLength(1);
    const text = renderText(report);
    expect(text).toContain("TARGET — Improve Looked at a product to Asked a question");
    expect(text).not.toContain("SETUP STEP — Improve Looked at a product");
  });

  it("THE SUBJECT COUNTS TARGETS AS TARGETS, NOT AS SETUP STEPS", () => {
    // "1 setup step to get started" over a business past the learning
    // threshold is wrong about where it is, and the subject is the one
    // line he reads before deciding to open it.
    const { report } = reportWithTargets();
    expect(report.subject).toBe("A Business — 1 target to approve");
  });

  it("THE PLAN LINE STOPS CALLING THEM SETUP ONCE THERE ARE TARGETS", () => {
    expect(planLine(READY, 0, 1)).toMatch(/targets below come from your own funnel/);
    expect(planLine(READY, 0, 1)).not.toMatch(/setup, not targets/);
    // And with none offered, S4's sentence is untouched.
    expect(planLine(READY, 0, 0)).toMatch(/setup, not targets/);
    expect(planLine(LEARNING, 0, 3)).toMatch(/^Still learning:/);
  });

  it("A BUSINESS WITH AN APPROVED PLAN IS NOT OFFERED DRAFTS AT ALL", () => {
    const { goals, declared } = targetGoalsFrom(diagnosis(), READY);
    const report = buildDailyReport({
      dealershipId: "d1",
      day: DAY,
      businessName: "A Business",
      tracking: tracking(),
      maturity: READY,
      counted: [],
      suggestions: [],
      setupGoals: [],
      targetGoals: goals,
      targetNumbers: declared,
      activeGoals: 2,
      findingCount: 0,
    });
    expect(report.blocks.filter((b) => b.kind === "setup")).toEqual([]);
  });
});
