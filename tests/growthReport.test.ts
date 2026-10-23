// S4/P4 — THE DAILY REPORT, AND THE EXIT TEST'S OWN WORDS.
//
//   > "Daily email arrives with only counted numbers; each suggestion
//   >  cites evidence and the goal it serves"
//
// Three claims, and the second is the load-bearing one. These tests are
// written so the failing case is the dangerous one: a number the owner
// acts on that nobody counted.
//
// The digit walk matches by VALUE, not by meaning. It stops an invented
// figure, because no counted value equals it. It would not catch a
// counted number given the wrong label — that is a human's job on the
// first real email, and saying so here is part of the test.

import { describe, it, expect, afterEach } from "vitest";
import { buildDailyReport, everyNumberIsCounted, renderText, type DailyReport } from "@/lib/growth/report";
import { maturityOf } from "@/lib/growth/strategy";
import type { Counted } from "@/lib/growth/audit";
import type { StrategistRow } from "@/lib/growth/strategist";
import type { TrackingState } from "@/lib/growth/tracking";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
});

const NOW = new Date("2026-10-23T04:00:00.000Z");
const DAY = "2026-10-23";

function tracking(over: Partial<TrackingState> = {}): TrackingState {
  return {
    siteEvents: { firing: true, lastAt: "2026-10-22T10:00:00Z", visitorEvents30d: 41, firstAt: "2026-08-01T10:00:00Z" },
    searchConsole: { connected: true, siteUrl: "https://example.test" },
    adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" },
    health: "ok",
    ...over,
  };
}

const COUNTED: Counted[] = [
  { label: "pages", value: 4, source: "website_pages" },
  { label: "products", value: 6, source: "products" },
  { label: "products with a description", value: 2, source: "products.description" },
];

function row(over: Partial<StrategistRow> = {}): StrategistRow {
  return {
    id: "o1",
    type: "products_without_description",
    reference_id: "singleton",
    title: "4 of 6 products have no description",
    impact: 4,
    confidence: 5,
    effort: 2,
    evidence: [{ kind: "product", id: "x1" }],
    goal_id: "g1",
    rejected_at: null,
    last_surfaced_on: null,
    status: "open",
    ...over,
  };
}

function build(over: Partial<Parameters<typeof buildDailyReport>[0]> = {}): DailyReport {
  return buildDailyReport({
    dealershipId: "d1",
    day: DAY,
    businessName: "A Business",
    tracking: tracking(),
    maturity: maturityOf({ firstAt: "2026-08-01T10:00:00Z", events: 41 }, NOW),
    counted: COUNTED,
    suggestions: [{ row: row(), goalTitle: "Describe every product" }],
    setupGoals: [],
    activeGoals: 1,
    findingCount: 1,
    ...over,
  });
}

function buildThin(): DailyReport {
  return build({
    maturity: maturityOf({ firstAt: "2026-10-21T00:00:00Z", events: 3 }, NOW),
    suggestions: [],
    activeGoals: 0,
    findingCount: 2,
    setupGoals: [
      { key: "k1", title: "Describe every product", description: "d", targetMetric: "products with a description", targetValue: 6, basis: [{ kind: "counted", id: "products" }] },
      { key: "k2", title: "Publish the website", description: "d", targetMetric: null, targetValue: null, basis: [] },
    ],
  });
}

describe("1. only counted numbers", () => {
  it("THE WHOLE REPORT PASSES THE DIGIT WALK", () => {
    const report = build();
    const check = everyNumberIsCounted(report);
    expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("AND AN INVENTED FIGURE IS CAUGHT, wherever it is put", () => {
    // The failure this check exists for: a figure nobody counted,
    // arriving in prose.
    const report = build();
    report.blocks.push({ kind: "line", text: "Your traffic is up 300% this week.", numbers: [] });
    const check = everyNumberIsCounted(report);
    expect(check.ok).toBe(false);
    expect(check.offenders.map((o) => o.found)).toContain("300");
  });

  it("A STAT CANNOT PRINT A VALUE IT DID NOT DECLARE", () => {
    const report = build();
    report.blocks.push({ kind: "stat", number: { label: "orders", value: 12, source: "orders" } });
    expect(everyNumberIsCounted(report).ok).toBe(true);
    // Mislabel the declaration and the digit no longer matches.
    report.blocks.push({ kind: "line", text: "You had 99 orders.", numbers: [{ label: "orders", value: 12, source: "orders" }] });
    const check = everyNumberIsCounted(report);
    expect(check.ok).toBe(false);
    expect(check.offenders.map((o) => o.found)).toContain("99");
  });

  it("A SUGGESTION'S OWN TITLE IS SUBJECT TO THE SAME RULE", () => {
    // A finding's title carries its own count. If that number is not
    // one this report counted, the walk refuses it — so a finding
    // cannot smuggle a figure in through its wording.
    const report = build({ suggestions: [{ row: row({ title: "9999 products have no description" }), goalTitle: "Describe every product" }] });
    const check = everyNumberIsCounted(report);
    expect(check.ok).toBe(false);
    expect(check.offenders.map((o) => o.found)).toContain("9999");
  });

  it("EVERY COUNTED NUMBER NAMES WHERE IT WAS COUNTED", () => {
    for (const c of build().counted) expect(String(c.source).trim()).not.toBe("");
  });

  it("AND SO DOES EVERY NUMBER A BLOCK DECLARES", () => {
    // The report-level list was the only thing checked before, and a
    // mutation that blanked a SETUP TARGET's source survived it. A
    // number with no source is exactly what this stage exists to stop,
    // wherever it is declared.
    for (const report of [build(), buildThin()]) {
      for (const b of report.blocks) {
        const declared = b.kind === "stat" ? [b.number] : b.kind === "setup" ? (b.target ? [b.target] : []) : b.numbers;
        for (const n of declared) {
          expect(String(n.source).trim(), `${b.kind}: ${n.label}`).not.toBe("");
        }
      }
    }
  });

  it("and the rendered text contains no CLAIM digit the structure did not allow", () => {
    // Rendered, not just structural: the email is what the owner reads.
    //
    // THREE LINES ARE EXCLUDED, all for the same reason — none of them
    // makes a claim about the business. The SUBJECT counts the email's
    // own sections, which the reader can verify by glancing down the
    // page; it is pinned separately and exactly by
    // "THE SUBJECT'S ONLY NUMBER IS A COUNT OF ITS OWN SECTIONS", so
    // the exemption cannot widen into "the subject may say anything".
    //
    // The other two, for the same reason —
    // they carry no claim about the business: the day line, which is
    // the report's own timestamp, and the "Based on" line, which is
    // evidence IDENTIFIERS. "product:x1" has a 1 in it and it is a
    // pointer, not a figure. The structural check does not cover them
    // either, and this says so rather than quietly stripping them: a
    // smuggled number would have to be put inside a row id generated
    // by code.
    const report = build();
    const allowed = new Set<string>();
    for (const b of report.blocks) {
      const declared = b.kind === "stat" ? [b.number] : b.kind === "setup" ? (b.target ? [b.target] : []) : b.numbers;
      for (const n of declared) allowed.add(String(n.value));
    }
    const claimLines = renderText(report)
      .split("\n")
      .filter((l, i) => i !== 0 && !l.startsWith("For ") && !l.trimStart().startsWith("Based on:"));
    for (const line of claimLines) {
      for (const found of line.match(/\d[\d,.]*/g) ?? []) {
        expect(allowed.has(found.replace(/[.,]+$/, "")), `${found} in: ${line}`).toBe(true);
      }
    }
  });
});

describe("2. no model is asked anything on this path", () => {
  it("BUILDING AND RENDERING ATTEMPT NO CALL AT ALL", async () => {
    // Counted by attempt, not by throw: a thrown error can be
    // swallowed downstream and leave a test green while a model is
    // called on every report. That mistake is recorded in copyAudit's
    // own tests, where it survived a mutation check.
    const calls: string[] = [];
    globalThis.fetch = (async (url: any) => {
      calls.push(String(url));
      throw new Error("the report must not call a model");
    }) as typeof fetch;
    const report = build();
    renderText(report);
    everyNumberIsCounted(report);
    expect(calls).toEqual([]);
  });
});

describe("3. each suggestion cites evidence and the goal it serves", () => {
  it("BOTH ARE RENDERED", () => {
    const text = renderText(build());
    expect(text).toMatch(/SUGGESTION — 4 of 6 products have no description/);
    expect(text).toMatch(/Toward your goal: Describe every product/);
    expect(text).toMatch(/Based on: product:x1/);
  });

  it("A SUGGESTION WITH NO EVIDENCE IS NOT RENDERED AT ALL", () => {
    const report = build({ suggestions: [{ row: row({ evidence: [] }), goalTitle: "Describe every product" }] });
    expect(report.blocks.filter((b) => b.kind === "suggestion")).toEqual([]);
    expect(renderText(report)).not.toMatch(/SUGGESTION/);
  });

  it("AND NEITHER IS ONE WITH NO GOAL", () => {
    const report = build({ suggestions: [{ row: row(), goalTitle: "   " }] });
    expect(report.blocks.filter((b) => b.kind === "suggestion")).toEqual([]);
  });
});

describe("4. the measurement health line is in every report", () => {
  it("IS THERE WHEN TRACKING IS HEALTHY", () => {
    expect(renderText(build())).toMatch(/Measurement health: OK\./);
  });

  it("AND WHEN IT IS BROKEN — §2c says every report", () => {
    const broken = tracking({
      siteEvents: { firing: false, lastAt: null, visitorEvents30d: 0, firstAt: null },
      searchConsole: { connected: false, siteUrl: null },
      adsConversions: { verified: false, why: "no ad campaign has run, so there is nothing to attribute" },
      health: "broken",
    });
    const report = build({ tracking: broken, maturity: maturityOf({ firstAt: null, events: 0 }, NOW) });
    const text = renderText(report);
    expect(text).toMatch(/Measurement health: BROKEN\./);
    expect(text).toMatch(/NOT being recorded/);
    expect(everyNumberIsCounted(report).ok).toBe(true);
  });

  it("and it says the owner's own visits were excluded", () => {
    expect(renderText(build())).toMatch(/your own visits excluded/);
  });
});

describe("5. the thin branch", () => {
  const thin = () =>
    build({
      maturity: maturityOf({ firstAt: "2026-10-21T00:00:00Z", events: 3 }, NOW),
      tracking: tracking({ siteEvents: { firing: true, lastAt: "2026-10-22T10:00:00Z", visitorEvents30d: 3, firstAt: "2026-10-21T00:00:00Z" } }),
      suggestions: [],
      activeGoals: 0,
      findingCount: 2,
      setupGoals: [
        { key: "products_without_description", title: "Describe every product", description: "Nothing to cite otherwise.", targetMetric: "products with a description", targetValue: 6, basis: [{ kind: "counted", id: "products" }] },
        { key: "site_unpublished", title: "Publish the website", description: "Nobody outside can open it.", targetMetric: null, targetValue: null, basis: [] },
      ],
    });

  it("SAYS STILL LEARNING, and shows setup steps instead of targets", () => {
    const text = renderText(thin());
    expect(text).toMatch(/Still learning:/);
    expect(text).toMatch(/setup, not targets/);
    expect(text).toMatch(/SETUP STEP — Describe every product/);
    expect(text).toMatch(/Target: products with a description — 6/);
  });

  it("A SETUP STEP WITH NO COUNTED TARGET SHOWS NO FIGURE", () => {
    const text = renderText(thin());
    expect(text).toMatch(/SETUP STEP — Publish the website/);
    const section = text.slice(text.indexOf("Publish the website"));
    expect(section).not.toMatch(/Target:/);
  });

  it("AND THE THIN REPORT STILL PASSES THE DIGIT WALK", () => {
    const check = everyNumberIsCounted(thin());
    expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);
  });

  it("setup steps are not shown once there is enough history", () => {
    const report = build({ activeGoals: 1, setupGoals: [{ key: "k", title: "T", description: "d", targetMetric: null, targetValue: null, basis: [] }] });
    expect(report.blocks.filter((b) => b.kind === "setup")).toEqual([]);
  });
});

describe("7. the subject promises only what is in the email", () => {
  // THE DRY RUN OF 23 OCTOBER CAUGHT THIS. The subject said "what I did
  // and what I would do next" over a report with no account of anything
  // done — S4 audits and suggests, it does not act. A subject line is
  // the first sentence the owner reads and it was overstating by a
  // whole section.

  it("COUNTS SUGGESTIONS WHEN THERE ARE ANY", () => {
    expect(build().subject).toBe("A Business — 1 suggestion for today");
  });

  it("COUNTS SETUP STEPS WHEN THERE ARE NO SUGGESTIONS", () => {
    expect(buildThin().subject).toBe("A Business — 2 setup steps to get started");
  });

  it("AND SAYS SO PLAINLY WHEN THERE IS NOTHING TO FLAG", () => {
    const quiet = build({ suggestions: [], setupGoals: [], findingCount: 0 });
    expect(quiet.subject).toBe("A Business — your daily check, nothing to flag");
  });

  it("THE SUBJECT'S ONLY NUMBER IS A COUNT OF ITS OWN SECTIONS", () => {
    // The digit walk skips the subject line, so this is what keeps that
    // exemption narrow: a subject that said "41 visits this month"
    // would fail here even though the walk would not see it.
    for (const r of [build(), buildThin(), build({ suggestions: [], setupGoals: [], findingCount: 0 })]) {
      const sections = r.blocks.filter((b) => b.kind === "suggestion" || b.kind === "setup").length;
      const digits = (r.subject.match(/\d+/g) ?? []).map(Number);
      expect(digits.length).toBeLessThanOrEqual(1);
      if (digits.length) expect(digits[0]).toBe(sections);
    }
  });

  it("NEVER CLAIMS TO HAVE DONE ANYTHING", () => {
    // S4 takes no actions at all. The day it does, the subject may say
    // so — and this test will be the thing that makes someone change
    // it deliberately rather than by accident.
    for (const r of [build(), buildThin(), build({ suggestions: [], setupGoals: [], findingCount: 0 })]) {
      expect(r.subject).not.toMatch(/what I did|I have done|completed|applied/i);
    }
  });
});

describe("8. the report cannot say nothing is wrong while something is", () => {
  // THE BUG THE FIRST REAL DRY RUN FOUND, 23 October 2026.
  // candle_by_qaaf: 44 days of data, 55 events — past the thin
  // threshold — and zero goals. Setup steps rendered only in the
  // learning state; suggestions need a goal. So two real findings
  // (5 pages with no search title, 1 product with no image) rendered
  // as nothing at all, and the subject said "nothing to flag".

  it("SETUP STEPS SHOW WHENEVER THERE IS NO PLAN, not only when the data is thin", () => {
    const report = build({
      maturity: maturityOf({ firstAt: "2026-09-09T00:00:00Z", events: 55 }, NOW), // ready
      activeGoals: 0,
      findingCount: 2,
      suggestions: [],
      setupGoals: [
        { key: "a", title: "Give every page a search title", description: "d", targetMetric: "pages with a search title", targetValue: 4, basis: [{ kind: "counted", id: "website_pages" }] },
        { key: "b", title: "Add an image to every product", description: "d", targetMetric: null, targetValue: null, basis: [] },
      ],
    });
    expect(report.blocks.filter((b) => b.kind === "setup")).toHaveLength(2);
    expect(report.subject).toBe("A Business — 2 setup steps to get started");
  });

  it("AND NEVER SAYS 'WORKING TO YOUR PLAN' WITH NO PLAN", () => {
    const report = build({
      maturity: maturityOf({ firstAt: "2026-09-09T00:00:00Z", events: 55 }, NOW),
      activeGoals: 0,
      findingCount: 2,
      suggestions: [],
      setupGoals: [],
    });
    const text = renderText(report);
    expect(text).not.toMatch(/Working to your plan/);
    expect(text).toMatch(/No plan is approved yet/);
  });

  it("'NOTHING TO FLAG' REQUIRES THAT NOTHING WAS FOUND", () => {
    const stuck = build({ suggestions: [], setupGoals: [], activeGoals: 1, findingCount: 2 });
    expect(stuck.subject).not.toMatch(/nothing to flag/);
    expect(stuck.subject).toBe("A Business — 2 things I could not put in front of you");
  });

  it("AND THE BODY EXPLAINS IT, not just the subject", () => {
    const stuck = build({ suggestions: [], setupGoals: [], activeGoals: 1, findingCount: 2 });
    const text = renderText(stuck);
    expect(text).toMatch(/could not put them in front of you/);
    expect(text).toMatch(/which goal they serve/);
    expect(text).toMatch(/Approve a plan/);
    // And that count is a declared number like every other.
    expect(everyNumberIsCounted(stuck).ok).toBe(true);
  });

  it("while a genuinely quiet day still reads as quiet", () => {
    const quiet = build({ suggestions: [], setupGoals: [], activeGoals: 1, findingCount: 0 });
    expect(quiet.subject).toBe("A Business — your daily check, nothing to flag");
    expect(renderText(quiet)).not.toMatch(/could not put/);
  });
});

describe("6. nothing in the report names a trade", () => {
  it("THE WHOLE RENDERED EMAIL IS TRADE-FREE", () => {
    const text = renderText(thin2());
    expect(text).not.toMatch(/candle|ghee|salon|dairy|paneer|keratin/i);
  });

  function thin2() {
    return build({
      suggestions: [{ row: row(), goalTitle: "Describe every product" }],
      setupGoals: [],
    });
  }
});
