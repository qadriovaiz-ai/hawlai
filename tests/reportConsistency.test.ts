// A report's words and its numbers never disagree.
//
// THE LIVE CASE: the Reports page's health-score text said "Trace where
// the ₹550 revenue came from" beside a Revenue card showing ₹0, and
// called the setup "a placeholder". The card summed leads' deal values;
// the narrative came from a separate report that counted a real ₹550
// website order. Now both come from one gathered set of numbers
// (reportBundle.ts) and every sentence is checked against it.

import { describe, it, expect, vi, afterEach } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { generateReportBundle } from "@/lib/reports/reportBundle";
import { allowedNumbers, narrativeProblems, keepConsistent } from "@/lib/reports/narrativeCheck";
import type { BusinessNumbers } from "@/lib/reports/businessNumbers";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

type Row = Record<string, any>;

function db(tables: Record<string, Row[]>) {
  return {
    from: (table: string) => {
      const api: any = {
        select: () => api, eq: () => api, not: () => api, in: () => api, gte: () => api, order: () => api,
        maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
        single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
        then: (resolve: any) => resolve({ data: tables[table] ?? [], error: null }),
      };
      return api;
    },
  };
}

// Connected to Meta, no campaigns launched — the growth narrative runs.
const base = (orders: Row[]): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", fb_page_access_token: "PAGE_TOKEN", fb_page_access_token_encrypted: null, onboarding_completed: true, business_category: "Home fragrance" }],
  leads: [],
  pending_approvals: [],
  ad_creatives: [],
  appointments: [],
  calls: [],
  orders,
});

// What the live page's AI wrote.
const GROWTH_AI = {
  healthScore: 12,
  headline: "One campaign, zero ad spend, zero leads — this isn't a marketing engine yet, it's a placeholder.",
  strengths: [],
  risks: ["Zero leads generated means the funnel is completely empty"],
  nextActions: [
    "Put actual budget behind the live campaign today — even ₹200/day — so it generates real data",
    "Trace where the ₹550 revenue came from (which post, which channel, which product) and replicate it",
  ],
};
const EXEC_AI = { summary: "You have 0 leads and ₹550 in revenue from 1 paid website order so far.", priorities: ["Review what brought in the ₹550 order"] };

function anthropic() {
  const prompts: { kind: "growth" | "exec"; text: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    if (!String(url).includes("anthropic")) return { ok: false, status: 404, json: async () => ({}) };
    const text: string = JSON.parse(init.body).messages[0].content;
    const kind = text.includes("growth advisor") ? "growth" : "exec";
    prompts.push({ kind, text });
    return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ text: JSON.stringify(kind === "growth" ? GROWTH_AI : EXEC_AI) }] }) };
  }));
  return prompts;
}

describe("one set of numbers for the cards and both narratives", () => {
  it("a real ₹550 paid order: the Revenue card shows ₹550, and the narrative that mentions it is kept", async () => {
    const prompts = anthropic();
    const { report, growth } = await generateReportBundle(db(base([{ total: 550, status: "delivered" }])), "d1", "Home fragrance");

    expect(report.stats.totalRevenue).toBe(550); // the card
    expect(growth.nextActions.join(" ")).toMatch(/₹550/);
    expect(report.summary).toMatch(/₹550/);
    expect(report.priorities).toEqual(["Review what brought in the ₹550 order"]);
    // Both prompts were given the SAME revenue line.
    const revenueLine = (t: string) => t.split("\n").find((l) => l.startsWith("Revenue:"));
    expect(revenueLine(prompts.find((p) => p.kind === "growth")!.text)).toBe(revenueLine(prompts.find((p) => p.kind === "exec")!.text));
  });

  it("no paid orders: the card shows ₹0, and every sentence claiming ₹550 is dropped", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    anthropic();
    const { report, growth } = await generateReportBundle(db(base([{ total: 550, status: "pending" }])), "d1", "Home fragrance");

    expect(report.stats.totalRevenue).toBe(0);
    const everything = [report.summary, ...report.priorities, growth.headline, ...growth.risks, ...growth.nextActions].join(" ");
    expect(everything).not.toMatch(/₹550/);
    // The ₹200/day budget suggestion is advice, not a claim — kept.
    expect(growth.nextActions.join(" ")).toMatch(/₹200\/day/);
  });

  it("'One campaign' when none is launched is dropped too — counts are checked, not just rupees", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    anthropic();
    const { growth } = await generateReportBundle(db(base([])), "d1", "Home fragrance");
    expect(growth.headline).not.toMatch(/One campaign/);
  });

  it("both prompts tell the model never to call the business a placeholder", async () => {
    const prompts = anthropic();
    await generateReportBundle(db(base([])), "d1", "Home fragrance");
    for (const p of prompts) expect(p.text).toMatch(/never call the business.*"placeholder"/i);
  });

  it("an unpaid (pending or cancelled) order is not revenue; delivered and confirmed are", async () => {
    anthropic();
    const { numbers } = await generateReportBundle(
      db(base([{ total: 550, status: "delivered" }, { total: 300, status: "confirmed" }, { total: 999, status: "pending" }, { total: 400, status: "cancelled" }])),
      "d1",
      "Home fragrance"
    );
    expect(numbers.orderRevenue).toBe(850);
    expect(numbers.paidOrders).toBe(2);
  });
});

describe("the consistency check itself", () => {
  const n = {
    totalLeads: 0, hotLeads: 0, warmLeads: 0, coldLeads: 0, convertedLeads: 0, leadsByStage: {},
    pendingApprovals: 0, campaignsLaunched: 1, liveCampaigns: 0, adDataReadable: true, adDataState: "ok",
    totalSpend: 0, costPerLead: null, leadRevenue: 0, orderRevenue: 550, paidOrders: 1, totalRevenue: 550,
    adAttributedRevenue: 550, roas: null, appointmentsScheduled: 0, appointmentsCompleted: 0, callsMade: 0, onboardingCompleted: true,
  } as BusinessNumbers;
  const allowed = allowedNumbers(n);

  it("rupee amounts must be one of the report's figures", () => {
    expect(narrativeProblems("You've made ₹550 so far", allowed)).toEqual([]);
    expect(narrativeProblems("You've made ₹5,500 so far", allowed)).toHaveLength(1);
    expect(narrativeProblems("Revenue of ₹0.55k", allowed)).toEqual([]);
  });

  it("budget suggestions are advice, not claims", () => {
    expect(narrativeProblems("Try ₹300/day, or ₹3,000 a month", allowed)).toEqual([]);
  });

  it("counts must match — in digits or words", () => {
    expect(narrativeProblems("You have one campaign and zero leads", allowed)).toEqual([]);
    expect(narrativeProblems("You have 3 leads", allowed)).toHaveLength(1);
    expect(narrativeProblems("You have two live campaigns", allowed)).toHaveLength(1);
  });

  it("'the ₹550 order' is an amount, not 550 orders", () => {
    expect(narrativeProblems("Review what brought in the ₹550 order", allowed)).toEqual([]);
    expect(narrativeProblems("Review what brought in the ₹900 order", allowed)).toHaveLength(1);
  });

  it("drops only the inconsistent items", () => {
    const r = keepConsistent(["Scale the ₹550 winner", "You have 9 orders"], allowed);
    expect(r.kept).toEqual(["Scale the ₹550 winner"]);
    expect(r.dropped).toHaveLength(1);
  });
});
