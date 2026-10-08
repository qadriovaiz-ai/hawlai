// A Health Score the model made up, and verdicts on five leads.
//
// candle_by_qaaf, 28 Sep and 1 Oct 2026. The score read 60/100, then
// 18/100, with nothing underneath it changing. It was not a measurement:
// growthAdvisorAgent asked the model for
// `healthScore: integer 0-100 (honest — a business with 0 leads or 0
// live campaigns should score low)` and printed what came back.
//
// Beside it, on the same five test leads and one order: "healthy",
// "20% (1 of 5), healthy", "something is stopping them at the door", and
// "20% is decent for a ₹999 product". Four confident statements about a
// sample that cannot support one.
//
// And the guard that was supposed to catch invented figures was being
// contradicted by its own rules: NARRATIVE_RULES said a suggested budget
// like "₹200/day" was fine, and then the guard dropped it after the paid
// call — which is what the Vercel log shows, twice, on 3 October.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { computeHealthScore, healthScoreSummary, SCORE_FLOOR } from "@/lib/reports/healthScore";
import { allowedNumbers, narrativeProblems, droppedNote, NARRATIVE_RULES, VERDICT_FLOOR } from "@/lib/reports/narrativeCheck";
import type { BusinessNumbers } from "@/lib/reports/businessNumbers";

/** candle_by_qaaf as it actually stands. */
function numbers(over: Partial<BusinessNumbers> = {}): BusinessNumbers {
  return {
    totalLeads: 5, hotLeads: 0, warmLeads: 0, coldLeads: 5, convertedLeads: 0,
    leadsByStage: { new: 5 },
    pendingApprovals: 0, campaignsLaunched: 1, liveCampaigns: 1,
    adDataReadable: true, adDataState: "ok",
    totalSpend: 0, costPerLead: null,
    leadRevenue: 0, orderRevenue: 550, paidOrders: 1, totalRevenue: 550,
    adAttributedRevenue: 0, roas: null,
    appointmentsScheduled: 0, appointmentsCompleted: 0, callsMade: 0,
    onboardingCompleted: true,
    ...over,
  } as BusinessNumbers;
}

describe("the score is counted, or there is no score", () => {
  it("refuses to score five leads and one order", () => {
    const result = computeHealthScore(numbers());
    expect(result.scored).toBe(false);
    if (result.scored) return;
    // Not 60, not 18. A score built on this swings twenty points on one
    // more enquiry, which reads like a trend and isn't one.
    expect(result.reason).toMatch(/Too little has happened to score this out of 100/);
    expect(result.reason).toMatch(/5 leads and 1 paid order/);
    expect(result.reason).toMatch(new RegExp(`${SCORE_FLOOR.leads} leads or ${SCORE_FLOOR.orders} paid orders`));
  });

  it("still shows the lines, so the owner sees where they stand", () => {
    // No score is not no information.
    const result = computeHealthScore(numbers());
    expect(result.lines.map((l) => l.label)).toEqual([
      "People getting in touch",
      "Enquiries that became customers",
      "Revenue on record",
      "Marketing actually running",
    ]);
    expect(result.lines.find((l) => l.label === "Revenue on record")!.basis).toBe("₹550 from 1 paid order");
  });

  it("names a campaign that is live and spending nothing", () => {
    // The live case: Active for 19 days at ₹0 and 0 impressions. "Live"
    // is a status, not a fact about reaching anyone.
    const line = computeHealthScore(numbers()).lines.find((l) => l.label === "Marketing actually running")!;
    expect(line.basis).toMatch(/live but spending nothing, so it isn't reaching anyone/);
    expect(line.earned).toBe(10);
  });

  it("scores a real business, and the number is the sum of its lines", () => {
    const result = computeHealthScore(numbers({ totalLeads: 60, convertedLeads: 15, totalRevenue: 90000, paidOrders: 40, liveCampaigns: 2, totalSpend: 12000 }));
    expect(result.scored).toBe(true);
    if (!result.scored) return;
    const summed = result.lines.reduce((s, l) => s + l.earned, 0);
    const possible = result.lines.reduce((s, l) => s + l.max, 0);
    expect(result.score).toBe(Math.round((summed / possible) * 100));
    expect(result.score).toBe(100);
  });

  it("leaves advertising OUT rather than scoring it zero when Meta can't be read", () => {
    // Scoring a disconnected account as "no marketing" blames the owner
    // for our own failure to read it.
    const result = computeHealthScore(numbers({ totalLeads: 60, paidOrders: 40, adDataReadable: false, adDataState: "not_connected" }));
    expect(result.scored).toBe(true);
    if (!result.scored) return;
    expect(result.lines.map((l) => l.label)).not.toContain("Marketing actually running");
    expect(result.unreadable.join(" ")).toMatch(/Meta isn't connected/);
    // Out of 75 scaled to 100, so the gap lowers confidence, not the score.
    expect(result.lines.reduce((s, l) => s + l.max, 0)).toBe(75);
  });

  it("the model is not asked for it and cannot override it", () => {
    const agent = readFileSync("src/lib/agents/growthAdvisorAgent.ts", "utf8");
    expect(agent).not.toMatch(/"healthScore":integer/);
    expect(agent).not.toMatch(/parsed\.healthScore/);
    // Every return path uses the one computed object, including the
    // fallbacks, which carried their own invented 10 / 50 / 30 / 60.
    expect(agent).not.toMatch(/healthScore: n\.totalLeads === 0 \? 10/);
    expect(agent).toMatch(/const health = computeHealthScore\(n\);/);
  });

  it("summarises itself in one line when a surface has room for one", () => {
    expect(healthScoreSummary(computeHealthScore(numbers()))).toMatch(/Too little has happened/);
    const real = healthScoreSummary(computeHealthScore(numbers({ totalLeads: 60, paidOrders: 40, convertedLeads: 12, totalRevenue: 50000 })));
    expect(real).toMatch(/^\d+\/100 — People getting in touch/);
  });
});

describe("no verdict on a handful", () => {
  const allowed = allowedNumbers(numbers());
  const tiny = { leads: 5, orders: 1 };

  it("flags the exact sentences that were shown", () => {
    for (const sentence of [
      "Your conversion rate is healthy at 20%.",
      "Something is stopping them at the door.",
      "The funnel is broken.",
      "Lead quality looks poor.",
    ]) {
      expect(narrativeProblems(sentence, allowed, tiny).length, sentence).toBeGreaterThan(0);
    }
  });

  it("says how few, so the reason is checkable", () => {
    const problems = narrativeProblems("Your funnel is healthy.", allowed, tiny);
    expect(problems[0]).toMatch(/on 5 lead\(s\) and 1 paid order\(s\) — too few to judge/);
  });

  it("allows the same verdict once there is enough behind it", () => {
    expect(narrativeProblems("Your funnel is healthy.", allowed, { leads: 120, orders: 40 })).toEqual([]);
  });

  it("refuses a benchmark with no source, whatever the sample", () => {
    for (const sample of [tiny, { leads: 500, orders: 200 }]) {
      const problems = narrativeProblems("20% is decent for a ₹999 product.", allowed, sample);
      expect(problems.some((p) => /known standard/.test(p)), JSON.stringify(sample)).toBe(true);
    }
  });

  it("refuses views described as people", () => {
    // The analytics count page views. "46 people visited" is a different
    // claim from "46 views", and it is the one nobody measured.
    const problems = narrativeProblems("46 people visited your shop this month.", allowed, { leads: 500, orders: 200 });
    expect(problems.some((p) => /count views, not unique visitors/.test(p))).toBe(true);
  });

  it("leaves an ordinary sentence alone", () => {
    expect(narrativeProblems("You have 5 leads and 1 paid order so far.", allowed, tiny)).toEqual([]);
  });

  it("the floor is stated, not buried", () => {
    expect(VERDICT_FLOOR).toEqual({ leads: 30, orders: 10 });
  });
});

describe("the rules and the guard agree about rupee figures", () => {
  it("no longer tells the model a suggested budget is fine", () => {
    // THE CONTRADICTION: the rule said `A suggested budget (e.g.
    // "₹200/day") is fine`, and the guard then dropped exactly that,
    // after the call had been paid for — twice on 3 October, in two
    // different agents.
    expect(NARRATIVE_RULES).not.toMatch(/A suggested budget.*is fine/);
    expect(NARRATIVE_RULES).toMatch(/NO RUPEE FIGURE OF YOUR OWN/);
    expect(NARRATIVE_RULES).toMatch(/₹200–₹300\/day/);
    // And says what to write instead, so the advice survives without it.
    expect(NARRATIVE_RULES).toMatch(/say so WITHOUT a number/);
  });

  it("still drops one if the model writes it anyway", () => {
    const problems = narrativeProblems("Activate a modest daily budget — even ₹200–₹300/day — on the live campaign today.", allowedNumbers(numbers()), { leads: 500, orders: 200 });
    expect(problems.some((p) => /₹200/.test(p))).toBe(true);
  });

  it("tells the owner something was removed, instead of only the log", () => {
    // The guard worked and the owner saw a report with a suggestion
    // missing and no reason, which reads as the product having nothing
    // to say.
    expect(droppedNote([])).toBeNull();
    const note = droppedNote(["nextActions: even ₹200/day"]);
    expect(note).toMatch(/One suggestion was removed/);
    expect(note).toMatch(/a figure or a judgement Hawlai can't stand behind/);
    expect(note).toMatch(/Nothing was changed about your business/);
  });

  it("both agents pass the sample and surface the note", () => {
    for (const file of ["src/lib/agents/growthAdvisorAgent.ts", "src/lib/agents/reportingAgent.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/const sample = \{ leads: /);
      expect(source, file).toMatch(/droppedNote\(dropped\)/);
    }
  });
});

describe("Active on Meta is not the same as running", () => {
  it("names a campaign that has shown nobody anything", async () => {
    const { notDeliveringNote } = await import("@/lib/ads/campaignDeliveryDisplay");
    const note = notDeliveringNote({
      state: "active",
      impressions: 0,
      spend: 0,
      activeSince: new Date(Date.now() - 19 * 86400000).toISOString(),
    });
    expect(note).toMatch(/Meta says this is Active, but it has shown nobody anything for 19 days/);
    expect(note).toMatch(/0 impressions and ₹0 spent/);
    // "Active" there means you haven't paused it.
    expect(note).toMatch(/means you haven't paused it, not that it's running/);
  });

  it("sends the owner to the one place that says WHY", async () => {
    const { notDeliveringNote } = await import("@/lib/ads/campaignDeliveryDisplay");
    const note = notDeliveringNote({ state: "active", impressions: 0, spend: 0, activeSince: null })!;
    // Hawlai cannot tell which cause it is, and must not guess.
    expect(note).toMatch(/delivery message on the ad set/);
    expect(note).toMatch(/payment verification, an ad set still in review, or no budget set/);
    expect(note).toMatch(/Nothing here can tell which/);
    // And refuses the advice the advisor was giving.
    expect(note).toMatch(/spending more won't fix a campaign that isn't delivering/);
  });

  it("says nothing about a campaign that is actually delivering", async () => {
    const { notDeliveringNote } = await import("@/lib/ads/campaignDeliveryDisplay");
    expect(notDeliveringNote({ state: "active", impressions: 4200, spend: 0 })).toBeNull();
    expect(notDeliveringNote({ state: "active", impressions: 0, spend: 150 })).toBeNull();
    expect(notDeliveringNote({ state: "paused", impressions: 0, spend: 0 })).toBeNull();
    expect(notDeliveringNote({ state: null, impressions: 0, spend: 0 })).toBeNull();
  });

  it("the table shows it instead of a bare Active", () => {
    const table = readFileSync("src/components/dashboard/CampaignTable.tsx", "utf8");
    expect(table).toMatch(/Active, not delivering/);
    expect(table).toMatch(/notDeliveringNote\(\{/);
  });
});

describe("a lead with no score is explained, not shown as zero", () => {
  it("the chart says which leads get scored and which don't", () => {
    // ai_score is written by exactly three paths — the website form, the
    // Meta lead-ads webhook and Vapi calls. candle_by_qaaf's five leads
    // are all "manual chat", so every bucket read zero while the sidebar
    // said "Scoring leads automatically".
    const chart = readFileSync("src/components/dashboard/AnalyticsCharts.tsx", "utf8");
    expect(chart).toMatch(/None of your leads have a score yet/);
    expect(chart).toMatch(/website form, a Meta\s*\n?\s*lead ad, or a phone call/);
    expect(chart).toMatch(/added from chat aren&apos;t scored/);
  });

  it("the sidebar no longer claims more than it does", () => {
    const sidebar = readFileSync("src/components/dashboard/Sidebar.tsx", "utf8");
    expect(sidebar).not.toMatch(/Scoring leads automatically/);
    expect(sidebar).toMatch(/Scoring leads from forms, ads and calls/);
  });

  it("and only those three paths write a score", () => {
    const { execFileSync } = require("child_process") as typeof import("child_process");
    // Scoped to the API routes, which is where a write to leads lives.
    // Elsewhere ai_score appears as a type annotation, a read, or seed
    // data — none of which decides whether a lead gets scored.
    const files = execFileSync("git", ["ls-files", "src/app/api"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".ts"));
    const writers = files.filter((f) => /ai_score:\s*\w/.test(readFileSync(f, "utf8")));
    expect(writers.sort()).toEqual([
      "src/app/api/public/leads/route.ts",
      "src/app/api/webhooks/meta-leads/route.ts",
      "src/app/api/webhooks/vapi/route.ts",
    ]);
  });
});

describe("the order value a forecast may use", () => {
  it("uses real order history, and says it is one order", async () => {
    const { attribute, averageOrderValue } = await import("@/lib/analytics/orderLinkage");
    const view = attribute(
      [{ id: "o1", total: 550, status: "confirmed", created_at: "2026-09-20T10:00:00Z" }],
      []
    );
    const aov = averageOrderValue(view, 999);
    // ₹999 is the catalogue price TODAY. The one real order was ₹550,
    // placed before the price went up — so ₹999 was neither the average
    // nor "known", and "(known)" is the word that made it a claim.
    expect(aov).toMatchObject({ value: 550, basis: "real_orders", sample: 1 });
    expect(aov.label).toBe("your one paid order so far");
  });

  it("labels a catalogue price as the assumption it is", async () => {
    const { attribute, averageOrderValue } = await import("@/lib/analytics/orderLinkage");
    const aov = averageOrderValue(attribute([], []), 999);
    expect(aov).toMatchObject({ value: 999, basis: "catalogue_price", sample: 0 });
    expect(aov.label).toMatch(/this is an assumption, not a measurement/);
  });

  it("says there is nothing to forecast with when there is nothing", async () => {
    const { attribute, averageOrderValue } = await import("@/lib/analytics/orderLinkage");
    expect(averageOrderValue(attribute([], []), null)).toMatchObject({ value: null, basis: "unknown" });
  });

  it("averages several real orders", async () => {
    const { attribute, averageOrderValue } = await import("@/lib/analytics/orderLinkage");
    const orders = [550, 999, 800].map((total, i) => ({ id: `o${i}`, total, status: "confirmed", created_at: "2026-09-20T10:00:00Z" }));
    const aov = averageOrderValue(attribute(orders, []), 999);
    expect(aov).toMatchObject({ value: 783, basis: "real_orders", sample: 3 });
    expect(aov.label).toBe("average of your 3 paid orders");
  });
});
