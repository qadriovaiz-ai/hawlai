// "3 approvals are waiting" — H3, redesigned 24 November 2026.
//
// ──────────────────────────────────────────────────────────────────
// WHAT CHANGED AND WHY. H3-a emailed the owner per approval, raised as
// an `approval_raised` event and sent by /api/events/dispatch within
// two minutes. The owner replaced it with a COUNT in the daily email
// he already receives: an approval raised at 2am does not need to wake
// anybody, and a notice per approval is a notice per approval. No
// WhatsApp leg either — per-message cost.
//
// THE FAILURE MODE THIS FILE MOSTLY GUARDS. The daily report refuses
// any block containing a figure it cannot trace to something counted,
// and removes THAT BLOCK rather than the email (3 November 2026, after
// a morning of total silence over the "5" in "5 pages have no search
// title"). So a count that is not declared does not produce a wrong
// number — it produces NO LINE, and the owner hears nothing about work
// waiting on him. That is the quiet failure, and it is what the digit
// walk below is for.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { buildDailyReport, everyNumberIsCounted, withoutUncountedBlocks, renderText } from "@/lib/growth/report";
import { maturityOf } from "@/lib/growth/strategy";
import { code } from "./helpers/source";

const DAY = "2026-11-24";
const NOW = new Date("2026-11-24T04:00:00Z");

// The real shape, as tests/growthReport uses it. A hand-rolled
// approximation blew up inside measurementHealthLine instead of
// testing anything.
const tracking = () =>
  ({
    siteEvents: { firing: true, lastAt: "2026-11-23T10:00:00Z", visitorEvents30d: 41, firstAt: "2026-08-01T10:00:00Z" },
    searchConsole: { connected: true, siteUrl: "https://example.test" },
    site: { published: true, why: "your site is published" },
    adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" },
    health: "ok",
  }) as any;

const build = (pendingApprovals?: number) =>
  buildDailyReport({
    dealershipId: "d1",
    day: DAY,
    businessName: "Candle by Qaaf",
    tracking: tracking(),
    maturity: maturityOf({ firstAt: "2026-08-01T10:00:00Z", events: 41 }, NOW),
    counted: [{ label: "Products", value: 6, source: "products" }],
    suggestions: [],
    setupGoals: [],
    activeGoals: 1,
    findingCount: 0,
    ...(pendingApprovals === undefined ? {} : { pendingApprovals }),
  });

const linesOf = (n?: number) =>
  build(n)
    .blocks.filter((b: any) => b.kind === "line")
    .map((b: any) => b.text)
    .join("\n");

describe("1. THE LINE SAYS THE COUNT, AND SURVIVES THE DIGIT WALK", () => {
  it("THE COUNT IS DECLARED, so the block is not silently removed", () => {
    // THE LOAD-BEARING ONE. An undeclared figure costs the whole
    // BLOCK, so the owner would hear nothing at all about work waiting
    // on him — and the email would otherwise look perfectly normal.
    const report = build(3);
    const check = everyNumberIsCounted(report);
    expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);

    const { report: sendable, removed } = withoutUncountedBlocks(report);
    expect(removed, "the approvals line was dropped as uncounted").toEqual([]);
    expect(renderText(sendable)).toContain("3 approvals are waiting");
  });

  it("AND THE DECLARED NUMBER IS THE COUNT ITSELF, traceable to its table", () => {
    const block: any = build(3).blocks.find((b: any) => b.kind === "line" && String(b.text).includes("approvals are waiting"));
    expect(block).toBeTruthy();
    expect(block.numbers).toEqual([{ label: "Approvals waiting", value: 3, source: "pending_approvals" }]);
  });

  it("A COUNT OF ONE READS AS ONE, not as '1 approvals'", () => {
    expect(linesOf(1)).toContain("1 approval is waiting");
    expect(linesOf(1)).not.toContain("1 approvals");
  });

  it("and a large count still traces", () => {
    const check = everyNumberIsCounted(build(12));
    expect(check.offenders).toEqual([]);
    expect(linesOf(12)).toContain("12 approvals are waiting");
  });
});

describe("2. ZERO IS SILENCE, NOT A ZERO", () => {
  it("NO LINE AT ALL WHEN NOTHING IS WAITING", () => {
    // A line that appears every morning saying nothing is a line the
    // eye learns to skip — and then it is skipped on the morning it is
    // not zero.
    expect(linesOf(0)).not.toMatch(/approval/i);
    expect(linesOf(0)).not.toContain("0 approvals");
  });

  it("AND NONE WHEN THE COUNT WAS NEVER PASSED", () => {
    // The two callers that build a report for a screen rather than an
    // email do not pass it, and must not get a wrong line.
    expect(linesOf(undefined)).not.toMatch(/approval/i);
  });
});

describe("3. IT SAYS WHAT IT DOES NOT SAY", () => {
  it("NO ACTION TYPE, NO AMOUNT, NO DETAIL — only a count and where to go", () => {
    // Those live on the card, the one place that can show them with a
    // decision attached. A summary here would be a second version of
    // the same claim, and the two would drift — the same reasoning
    // that makes the card quote its own stored sentence.
    const line = linesOf(3);
    expect(line).toContain("Approvals");
    expect(line).not.toMatch(/₹/);
    expect(line).not.toMatch(/send_email|send email|publish|campaign/i);
  });

  it("AND IT SAYS NOTHING HAS HAPPENED", () => {
    expect(linesOf(2)).toContain("nothing happens until you decide");
  });
});

describe("4. THE COUNT IS READ AT REPORT TIME, NOT CARRIED FROM THE DAILY WORK", () => {
  it("THE READ IS IN buildGrowthReport, beside the comparison", () => {
    // Same reasoning the file already states for `comparison`: it is
    // about what the owner is being TOLD, and a count gathered hours
    // earlier can be wrong in the direction that matters — he may have
    // decided them all since.
    const src = code("src/lib/growth/dailyGrowth.ts");
    const at = src.indexOf("let pendingApprovals = 0;");
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 600);
    expect(block).toMatch(/from\("pending_approvals"\)/);
    expect(block).toMatch(/\.eq\("dealership_id", dealershipId\)/);
    expect(block).toMatch(/\.eq\("status", "pending"\)/);
    // And it is inside buildGrowthReport, not runGrowthWork.
    const work = src.indexOf("export async function runGrowthWork");
    const report = src.indexOf("export async function buildGrowthReport");
    expect(at).toBeGreaterThan(report);
    expect(report).toBeGreaterThan(work);
  });

  it("AND AN UNREADABLE TABLE COSTS THE LINE, NEVER THE EMAIL", () => {
    // October's nine dead days and 3 November's silence in one rule: a
    // guard whose failure mode is "say nothing" hands the owner the
    // one outcome he cannot act on.
    const src = code("src/lib/growth/dailyGrowth.ts");
    const at = src.indexOf("let pendingApprovals = 0;");
    const block = src.slice(at, at + 600);
    expect(block).toMatch(/try \{/);
    expect(block).toMatch(/catch/);
    expect(block, "a failed count throws into the report").not.toMatch(/throw/);
  });

  it("nothing is notified per approval any more", () => {
    // The replaced design. requestApproval must not queue an event,
    // and no handler may exist for one.
    const raise = code("src/lib/chat/requestApproval.ts");
    expect(raise, "an approval still queues a per-approval notice").not.toMatch(/emitEvent|approval_raised/);
    const handlers = code("src/lib/events/eventHandlers.ts");
    expect(handlers, "a per-approval notice handler is still registered").not.toMatch(/approval_raised/);
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. THE NUMBER READ IS THE NUMBER TOLD
//
// FOUND BY MUTATION. Everything above tests `buildDailyReport`, which
// is pure, plus a source read of the query. So replacing
// `pendingApprovals = Number(count ?? 0) || 0` with `= 0` SURVIVED:
// the count was fetched and then thrown away, and the email would
// simply never mention an approval again. The same class as a `confirm`
// sentence being read and not used, two commits ago.
//
// So this runs buildGrowthReport for real, with a client that answers
// a counting select, and captures what reaches the report builder.
// ──────────────────────────────────────────────────────────────────

import { vi } from "vitest";
import { buildGrowthReport } from "@/lib/growth/dailyGrowth";

/** Answers a head+count select on pending_approvals, and nothing else. */
function clientCounting(n: number | null) {
  const from = (table: string) => {
    const api: any = {
      select: (_cols?: string, opts?: any) => {
        api.__counting = table === "pending_approvals" && opts?.count === "exact";
        return api;
      },
      eq: () => api,
      lt: () => api,
      gt: () => api,
      gte: () => api,
      lte: () => api,
      in: () => api,
      is: () => api,
      not: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      insert: async () => ({ data: null, error: null }),
      update: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      then: (res: any, rej: any) =>
        Promise.resolve(api.__counting ? { data: null, count: n, error: null } : { data: [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

const EMPTY_WORK: any = {
  day: DAY,
  now: NOW,
  tracking: tracking(),
  maturity: maturityOf({ firstAt: "2026-08-01T10:00:00Z", events: 41 }, NOW),
  findings: [],
  counted: [{ label: "Products", value: 6, source: "products" }],
  alsoCounted: [],
  setupGoals: [],
  targetGoals: [],
  targetNumbers: [],
  noTargetsBecause: null,
  noTargetsNumbers: [],
  askForFact: null,
  drafts: { drafted: 0, pending: 0 },
  picks: { picked: [], skipped: [], alreadySurfaced: 0, today: DAY },
  activeGoals: 1,
  suggestions: [],
  copyAuditCostInr: 0,
  copyAuditUnverified: false,
  copyLinesSeen: 0,
};

describe("5. THE NUMBER READ IS THE NUMBER TOLD", () => {
  it("THE COUNT THE DATABASE RETURNED IS THE COUNT THE REPORT IS GIVEN", async () => {
    const reportModule = await import("@/lib/growth/report");
    let seen: any = "never called";
    const spy = vi.spyOn(reportModule, "buildDailyReport").mockImplementation(((input: any) => {
      seen = input.pendingApprovals;
      return { dealershipId: input.dealershipId, day: input.day, subject: "s", counted: [], blocks: [] };
    }) as any);
    try {
      await buildGrowthReport(clientCounting(4) as any, "d1", EMPTY_WORK);
    } finally {
      spy.mockRestore();
    }
    expect(seen, "the count was read and then thrown away").toBe(4);
  });

  it("AND A NULL COUNT BECOMES ZERO, not NaN and not a line", async () => {
    const reportModule = await import("@/lib/growth/report");
    let seen: any = "never called";
    const spy = vi.spyOn(reportModule, "buildDailyReport").mockImplementation(((input: any) => {
      seen = input.pendingApprovals;
      return { dealershipId: input.dealershipId, day: input.day, subject: "s", counted: [], blocks: [] };
    }) as any);
    try {
      await buildGrowthReport(clientCounting(null) as any, "d1", EMPTY_WORK);
    } finally {
      spy.mockRestore();
    }
    expect(seen).toBe(0);
  });
});
