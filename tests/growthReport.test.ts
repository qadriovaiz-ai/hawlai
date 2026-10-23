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
    ...over,
  });
}

function buildThin(): DailyReport {
  return build({
    maturity: maturityOf({ firstAt: "2026-10-21T00:00:00Z", events: 3 }, NOW),
    suggestions: [],
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
    // TWO KINDS OF LINE ARE EXCLUDED, and both for the same reason —
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
      .filter((l) => !l.startsWith("For ") && !l.trimStart().startsWith("Based on:"));
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
      setupGoals: [
        { key: "products_without_description", title: "Describe every product", description: "Nothing to cite otherwise.", targetMetric: "products with a description", targetValue: 6, basis: [{ kind: "counted", id: "products" }] },
        { key: "site_unpublished", title: "Publish the website", description: "Nobody outside can open it.", targetMetric: null, targetValue: null, basis: [] },
      ],
    });

  it("SAYS STILL LEARNING, and shows setup steps instead of targets", () => {
    const text = renderText(thin());
    expect(text).toMatch(/Still learning:/);
    expect(text).toMatch(/setup steps, not targets/);
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
    const report = build({ setupGoals: [{ key: "k", title: "T", description: "d", targetMetric: null, targetValue: null, basis: [] }] });
    expect(report.blocks.filter((b) => b.kind === "setup")).toEqual([]);
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
