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
  TARGET_CYCLE_DAYS,
  TARGET_KEY_PREFIX,
  isTargetKey,
  lastOfferedOn,
  parseTargetKey,
  stepIdOf,
  targetGoalsFrom,
  targetKeyFor,
  targetStepId,
  weakestStepFor,
} from "@/lib/growth/targets";
import { measureForTarget } from "@/lib/growth/measures";
import { buildDailyReport, everyNumberIsCounted, renderText, withoutUncountedBlocks } from "@/lib/growth/report";
import { draftTargetsAreOwn, maturityOf, planLine } from "@/lib/growth/strategy";
import { MIN_STEP_ENTRY, buildDiagnosis, type Diagnosis, type Funnel, type FunnelStep } from "@/lib/strategy/diagnosis";
import type { Counted } from "@/lib/growth/audit";
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
    expect(goals[0].key).toBe(`${TARGET_KEY_PREFIX}website_to_enquiry:product_view_to_enquiry:${DAY}`);
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
    expect(parseTargetKey(targetKeyFor("Website to enquiry", "product_view", "enquiry", DAY))).toEqual({
      funnel: "website_to_enquiry",
      fromKey: "product_view",
      toKey: "enquiry",
      offeredOn: DAY,
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
    expect(weakestStepFor(d, `${TARGET_KEY_PREFIX}website_to_enquiry:product_view_to_enquiry:${DAY}`)).toBeNull();
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

describe("3b. THE SAME STEP COMES BACK AFTER 30 DAYS", () => {
  // The founder's answer, 4 November 2026: offer it again after 30
  // days, whatever became of the last one, because the funnel may have
  // moved. Everything here is about the SAME step — a different weakest
  // step is a different key and is offered the next morning.

  const STEP = targetStepId("Website to enquiry", "product_view", "enquiry");
  const offer = (day: string, status = "completed") => ({
    sourceKey: `${TARGET_KEY_PREFIX}${STEP}:${day}`,
    createdAt: `${day}T06:00:00.000Z`,
    status,
  });

  it("NOT OFFERED AGAIN THE NEXT MORNING", () => {
    const { goals, why } = targetGoalsFrom(diagnosis(), READY, [offer("2026-11-03")], DAY);
    expect(goals).toEqual([]);
    // "1 day", not "1 days": since 5 November this sentence is email
    // copy rather than a log line, and the owner reads it.
    expect(String(why)).toMatch(/offered 1 day ago/);
    expect(String(why)).not.toMatch(/1 days/);
  });

  it("NOT OFFERED ON DAY 29, AND OFFERED ON DAY 30", () => {
    // The boundary is the whole rule. An off-by-one here is either a
    // step that comes back a day early every month, or one that never
    // comes back at all.
    const day29 = targetGoalsFrom(diagnosis(), READY, [offer("2026-10-06")], DAY);
    expect(day29.goals).toEqual([]);
    const day30 = targetGoalsFrom(diagnosis(), READY, [offer("2026-10-05")], DAY);
    expect(day30.goals).toHaveLength(1);
  });

  it("OFFERED AGAIN WHATEVER BECAME OF THE LAST ONE", () => {
    // completed, abandoned, still a draft, still active — the founder
    // said all four, in those words: "chahe purana poora hua ho ya
    // nahi". A rule that only re-offered finished goals would go quiet
    // about a step he ignored, which is the step most worth raising.
    for (const status of ["completed", "abandoned", "draft", "active"]) {
      const { goals } = targetGoalsFrom(diagnosis(), READY, [offer("2026-09-01", status)], DAY);
      expect(goals, status).toHaveLength(1);
    }
  });

  it("THE NEW OFFER CARRIES TODAY'S KEY AND TODAY'S RATE, not the old one's", () => {
    // A re-offer whose numbers were a month old would be worse than no
    // re-offer: he would approve a target against a rate that has
    // already moved, and its baseline would be wrong from the start.
    const { goals, declared } = targetGoalsFrom(diagnosis(), READY, [offer("2026-09-01")], DAY);
    expect(goals[0].key).toBe(`${TARGET_KEY_PREFIX}${STEP}:${DAY}`);
    expect(goals[0].key).not.toContain("2026-09-01");
    expect(goals[0].description).toContain("12.5%");
    expect(declared.some((c) => c.value === 12.5)).toBe(true);
  });

  it("A DIFFERENT STEP IS NOT MADE TO WAIT 30 DAYS", () => {
    // The clock is per step, not per business and not per funnel. If
    // the weakest step moved yesterday, the owner hears about the new
    // one this morning.
    const moved = diagnosis({
      funnels: [
        funnel({
          weakest: { from: "Visited the site", to: "Looked at a product", fromKey: "visit", toKey: "product_view", rate: 30, entered: 400 },
        }),
      ],
    });
    const { goals } = targetGoalsFrom(moved, READY, [offer("2026-11-03")], DAY);
    expect(goals).toHaveLength(1);
    expect(goals[0].key).toContain("visit_to_product_view");
  });

  it("AND THE THIN REASON STILL WINS over 'offered recently'", () => {
    // Two true sentences; the one about the business is more use than
    // the one about this product's schedule.
    //
    // TWO FUNNELS, ON PURPOSE. The first version of this test had one
    // thin funnel and no step that had been offered, so only one
    // sentence existed and the ORDER was unreachable — a mutation that
    // put the schedule first survived. A thin funnel skips before the
    // cycle is ever consulted, so the recently-offered step has to be
    // a different funnel.
    const thin = "No step has 10 people entering it yet, so none can be called the weakest.";
    const { goals, why } = targetGoalsFrom(
      diagnosis({ funnels: [funnel({ name: "Thin funnel", weakest: null, thin }), funnel()] }),
      READY,
      [offer("2026-11-03")],
      DAY
    );
    expect(goals).toEqual([]);
    expect(why).toBe(thin);
  });

  it("the cycle is thirty days, and stepIdOf ignores the day", () => {
    expect(TARGET_CYCLE_DAYS).toBe(30);
    expect(stepIdOf(`${TARGET_KEY_PREFIX}${STEP}:${DAY}`)).toBe(STEP);
    expect(stepIdOf(`${TARGET_KEY_PREFIX}${STEP}`)).toBe(STEP);
    expect(stepIdOf("pages_without_search_title")).toBeNull();
  });

  it("A KEY FROM BEFORE THE DAY EXISTED STILL COUNTS AS AN OFFER", () => {
    // The first shape of this key had three segments. A goal written
    // under it must keep resolving to its step, or the day this shipped
    // its decisions would have stopped being measurable and it would
    // have been offered again immediately.
    const legacy = { sourceKey: `${TARGET_KEY_PREFIX}${STEP}`, createdAt: "2026-11-03T06:00:00.000Z" };
    expect(parseTargetKey(legacy.sourceKey)?.offeredOn).toBeNull();
    expect(lastOfferedOn([legacy], STEP, DAY)).toBe("2026-11-03");
    expect(targetGoalsFrom(diagnosis(), READY, [legacy], DAY).goals).toEqual([]);
  });

  it("AND AN OFFER WITH NO DATE AT ALL IS NOT RE-OFFERED", () => {
    // created_at is set by Postgres, so this is close to impossible.
    // If it ever happens, a step missed for a month is a smaller fault
    // than the same step on the Tasks page every morning.
    const dateless = { sourceKey: `${TARGET_KEY_PREFIX}${STEP}`, createdAt: null };
    expect(lastOfferedOn([dateless], STEP, DAY)).toBe(DAY);
    expect(targetGoalsFrom(diagnosis(), READY, [dateless], DAY).goals).toEqual([]);
  });

  it("AN OFFER WHOSE DATE CANNOT BE READ IS NOT RE-OFFERED EITHER", () => {
    // `age === null` was unreachable in the first version of these
    // tests: every fixture had a readable date, so a mutation flipping
    // the unreadable case to "old enough" survived. A row whose date
    // nobody can read is not a row from a month ago.
    const broken = { sourceKey: `${TARGET_KEY_PREFIX}${STEP}:2026-11-03`, createdAt: "not a date at all" };
    expect(targetGoalsFrom(diagnosis(), READY, [broken], DAY).goals).toEqual([]);
  });

  it("THE NEWEST OFFER IS THE ONE THE CLOCK RUNS FROM", () => {
    // With one offer per step in every fixture, the comparison that
    // picks the latest was never exercised — a mutation taking the
    // OLDEST survived, which in a year-old account would re-offer
    // every step every morning.
    const offers = [offer("2026-09-01"), offer("2026-11-03"), offer("2026-06-15")];
    expect(lastOfferedOn(offers, STEP, DAY)).toBe("2026-11-03");
    expect(targetGoalsFrom(diagnosis(), READY, offers, DAY).goals).toEqual([]);
  });

  it("and another step's offers do not hold this one back", () => {
    const other = { sourceKey: `${TARGET_KEY_PREFIX}other_funnel:a_to_b:2026-11-03`, createdAt: "2026-11-03T06:00:00.000Z" };
    expect(lastOfferedOn([other], STEP, DAY)).toBeNull();
    expect(targetGoalsFrom(diagnosis(), READY, [other], DAY).goals).toHaveLength(1);
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

  it("A BUSINESS WITH AN APPROVED PLAN IS SHOWN ITS TARGET, AND NO SETUP STEPS", () => {
    // THIS TEST ASSERTED THE BUG UNTIL 6 NOVEMBER 2026, and the founder
    // found it from the outside: candle_by_qaaf had two targets drafted
    // into `goals` at 14:37 UTC on 5 November and read an email that
    // mentioned neither. Both blocks sat inside `hasNoPlan`, so a
    // business with an approved plan — which is every business a target
    // is FOR, since a target is about a funnel that is already running
    // — never saw one.
    //
    // RESTATED RATHER THAN DELETED, and it is stricter now: it holds
    // down both halves of the decision. Setup steps keep the gate,
    // because "getting started" is only true while there is nothing to
    // score against; targets do not.
    const { goals, declared } = targetGoalsFrom(diagnosis(), READY);
    const report = buildDailyReport({
      dealershipId: "d1",
      day: DAY,
      businessName: "A Business",
      tracking: tracking(),
      maturity: READY,
      counted: [],
      suggestions: [],
      setupGoals: [{ key: "k", title: "Publish the website", description: "d", targetMetric: null, targetValue: null, basis: [] }],
      targetGoals: goals,
      targetNumbers: declared,
      activeGoals: 2,
      findingCount: 0,
    });
    const setupBlocks = report.blocks.filter((b) => b.kind === "setup");
    expect(setupBlocks).toHaveLength(1);
    expect(setupBlocks.every((b: any) => b.isTarget)).toBe(true);
    const text = renderText(report);
    expect(text).toContain("TARGET — Improve Looked at a product to Asked a question");
    expect(text).not.toContain("Publish the website");
    // AND THE DIGIT WALK STILL PASSES on this branch, which the gate
    // used to make unreachable: the target's three figures were never
    // walked in a with-plan report before today.
    expect(withoutUncountedBlocks(report).removed).toEqual([]);
  });

  it("AND THE SUBJECT NAMES THE TARGET EVEN WHEN THERE ARE SUGGESTIONS", () => {
    // The ordinary morning for a running business is both, and
    // suggestions won the subject outright. A suggestion is something
    // to read; a target is a decision waiting on him, and the subject
    // is the only line he reads before deciding to open it.
    const { goals, declared } = targetGoalsFrom(diagnosis(), READY);
    const shown: Counted[] = [{ label: "products with no description", value: 1, source: "products.description" }];
    const report = buildDailyReport({
      dealershipId: "d1",
      day: DAY,
      businessName: "A Business",
      tracking: tracking(),
      maturity: READY,
      counted: [],
      declared: shown,
      suggestions: [
        {
          row: {
            id: "o1",
            dealership_id: "d1",
            type: "products_without_description",
            title: "1 product has no description",
            evidence: [{ kind: "product", id: "x1" }],
            goal_id: "g1",
            rejected_at: null,
            last_surfaced_on: null,
            status: "open",
          } as any,
          goalTitle: "Describe every product",
        },
      ],
      setupGoals: [],
      targetGoals: goals,
      targetNumbers: declared,
      activeGoals: 2,
      findingCount: 1,
    });
    expect(report.subject).toBe("A Business — 1 suggestion and 1 target to approve");
  });
});

describe("6. WHEN THERE IS NO TARGET, THE OWNER IS TOLD WHY — 5 November 2026", () => {
  // THE OTHER HALF OF THE SAME SILENCE. `targetGoalsFrom` has returned
  // a sentence for the empty case since S5/P4, `runDailyGrowth` has put
  // it in its result, and the call site dropped it. So an owner whose
  // funnel was too thin, or whose step was offered three weeks ago,
  // read an email with no mention of targets at all — identical, from
  // where he sits, to a product that had forgotten about them.
  //
  // THE SENTENCE STATES FIGURES, which is why `whyCounted` exists. A
  // line whose numbers nothing declares is pruned, and he would be told
  // "I left 1 thing out" instead of being told the reason.

  function tracking(): TrackingState {
    return {
      siteEvents: { firing: true, lastAt: "2026-11-03T10:00:00Z", visitorEvents30d: 55, firstAt: "2026-09-01T10:00:00Z" },
      searchConsole: { connected: true, siteUrl: "https://example.test" },
      adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" },
      health: "ok",
    };
  }

  function reportFor(why: string | null, whyCounted: Counted[], targetGoals: any[] = []) {
    return buildDailyReport({
      dealershipId: "d1",
      day: DAY,
      businessName: "A Business",
      tracking: tracking(),
      maturity: READY,
      counted: [],
      suggestions: [],
      setupGoals: [],
      targetGoals,
      targetNumbers: [],
      noTargetsBecause: why,
      noTargetsNumbers: whyCounted,
      activeGoals: 2,
      findingCount: 0,
    });
  }

  it("THE REAL 'TOO THIN' SENTENCE REACHES HIM AND SURVIVES THE DIGIT WALK", () => {
    // BUILT BY diagnosis.ts, not typed into this file. That sentence
    // states MIN_STEP_ENTRY, and targets.ts declares exactly that one
    // figure — so if diagnosis ever puts a second number in it, this
    // test fails here rather than the owner losing the line from his
    // email.
    const thinFunnel = buildDiagnosis({
      models: ["ecommerce" as any],
      from: "2026-08-06",
      to: DAY,
      businessStart: null,
      events: Array.from({ length: MIN_STEP_ENTRY - 1 }, () => ({ event_type: "page_view" })),
      leads: [{ id: "l1", source: null, status: "new" }],
      firstTouch: {},
      orders: [],
      abandonedCarts: 0,
      atRisk: [],
      paid: null,
    });
    const realThin = thinFunnel.funnels[0].thin;
    expect(realThin, "diagnosis stopped saying why a funnel is too thin").toMatch(/Not enough traffic yet/);

    const { goals, why, whyCounted } = targetGoalsFrom(thinFunnel, READY, [], DAY);
    expect(goals).toEqual([]);
    expect(why).toBe(realThin);

    const report = reportFor(why, whyCounted);
    const text = renderText(report);
    expect(text).toContain("No new target for you to approve today.");
    expect(text).toContain(String(realThin));
    expect(withoutUncountedBlocks(report).removed, JSON.stringify(everyNumberIsCounted(report).offenders)).toEqual([]);
  });

  it("AND SO DOES THE 30-DAY WAIT, WITH BOTH OF ITS FIGURES DECLARED", () => {
    const { why, whyCounted } = targetGoalsFrom(
      diagnosis(),
      READY,
      [{ sourceKey: `${TARGET_KEY_PREFIX}${targetStepId("Website to enquiry", "product_view", "enquiry")}:2026-10-20`, createdAt: "2026-10-20T06:00:00.000Z" }],
      DAY
    );
    expect(String(why)).toMatch(/offered 15 days ago/);
    expect(String(why)).toMatch(/after 30 days/);
    // BOTH, not one. A line declaring only the cycle would be pruned
    // over the age, and declaring only the age would be pruned over the
    // cycle — and either way he reads "I left 1 thing out".
    expect(whyCounted.map((c) => c.value).sort((a, b) => a - b)).toEqual([15, 30]);
    const report = reportFor(why, whyCounted);
    expect(withoutUncountedBlocks(report).removed, JSON.stringify(everyNumberIsCounted(report).offenders)).toEqual([]);
    expect(renderText(report)).toContain("offered 15 days ago");
  });

  it("AN UNREADABLE DATE PRINTS NO FIGURE, SO IT DECLARES NONE", () => {
    // The dangerous shape. `age` is null here, and a sentence that
    // printed "null days ago" — or a declaration of a figure the
    // sentence never printed — is the invented number this file exists
    // to refuse.
    const { why, whyCounted } = targetGoalsFrom(
      diagnosis(),
      READY,
      [{ sourceKey: `${TARGET_KEY_PREFIX}${targetStepId("Website to enquiry", "product_view", "enquiry")}:2026-10-20`, createdAt: "not a date at all" }],
      DAY
    );
    expect(String(why)).toMatch(/on a date I cannot read/);
    expect(String(why)).not.toMatch(/null/);
    expect(whyCounted.map((c) => c.value)).toEqual([TARGET_CYCLE_DAYS]);
    expect(withoutUncountedBlocks(reportFor(why, whyCounted)).removed).toEqual([]);
  });

  it("AND THE LINE IS NOT SHOWN ABOVE A TARGET", () => {
    // targetGoalsFrom returns goals or a reason, never both, so this is
    // belt and braces — but "no new target today" printed above a
    // target is the 23 October fault in a smaller place.
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
      noTargetsBecause: "Something that should never be shown.",
      noTargetsNumbers: [],
      activeGoals: 2,
      findingCount: 0,
    });
    expect(renderText(report)).not.toContain("No new target");
    expect(renderText(report)).toContain("TARGET — Improve");
  });

  it("and a blank reason adds no line at all", () => {
    // Every pre-P4 caller passes nothing, and a report that printed
    // "No new target for you to approve today. " with nothing after it
    // would be worse than silence.
    for (const blank of [null, undefined, "", "   "]) {
      const report = reportFor(blank as any, []);
      expect(renderText(report), String(blank)).not.toContain("No new target");
    }
  });
});
