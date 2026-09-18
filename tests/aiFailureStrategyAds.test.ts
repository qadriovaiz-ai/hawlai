// Ads, strategy, growth and research say why the AI failed — and never
// dress a template up as advice.
//
// Same live case as aiFailureSurfaces.test.ts (credits ran out,
// 2026-09-18), for the second batch of departments moved onto
// lib/ai/claude.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const credits: number[] = [];
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async (_d: string, inr: number) => { credits.push(inr); } }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));
vi.mock("@/lib/agents/analyticsAgent", () => ({
  getCampaignPerformanceState: async () => ({ state: "ok", value: { campaigns: [{ id: "c1", headline: "Diwali candles", spend: 2400, leads: 3 }], totals: {} } }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) }) }));

import { generateAdPlan } from "@/lib/agents/paidAdsAgent";
import { generateRetargetingCopy } from "@/lib/agents/retargetingAgent";
import { generateMarketingStrategy } from "@/lib/agents/strategyAgent";
import { generateDeepStrategy } from "@/lib/agents/deepStrategyAgent";
import { analyzeDescription } from "@/lib/agents/businessIntelligenceAgent";
import { generateCompetitorIntel } from "@/lib/agents/competitorIntelAgent";
import { generateResearch, generateSentimentFromLeads } from "@/lib/agents/researchAgentV2";
import { generateGrowthOpportunities, generateBudgetRecommendations, generateExpansionStrategy } from "@/lib/agents/growthAdvisorV2";
import { matchCampaign, proposeBudgetChange, proposeTargetingChange } from "@/lib/agents/campaignEditAgent";
import { decomposeGoal } from "@/lib/agents/goalPlanningAgent";
import { analyzeCampaigns } from "@/lib/agents/optimizationAgent";
import { generateChannelAdvice, ADVICE_FAILURE_MESSAGE } from "@/lib/strategy/channelAdvice";
import { buildDiagnosis } from "@/lib/strategy/diagnosis";
import { resetOperatorAlerts } from "@/lib/ai/claude";

const OUTAGE = "AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.";
const BUSY = "The AI service is busy — try again in a minute.";
const CREDITS = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } } };
const RATE = { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "rate limited" } } };
const ok = (content: any[], usage = { input_tokens: 100, output_tokens: 50 }) => ({ status: 200, body: { content, usage } });

function anthropic(...replies: { status: number; body: any }[]) {
  let n = 0;
  const spy = vi.fn(async () => {
    const r = replies[Math.min(n++, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const CAMPAIGN: any = { id: "c1", headline: "Diwali candles", daily_budget: 500, targeting_city: "Lucknow", meta_status: "ACTIVE" };

beforeEach(() => {
  credits.length = 0;
  resetOperatorAlerts();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("credits out: every generator says so, in the approved words, without retrying", () => {
  const cases: [string, () => Promise<any>][] = [
    ["Paid Ads plan", () => generateAdPlan("google", "audience_research", "Candle by Qaaf", "Home fragrance")],
    ["Marketing strategy", () => generateMarketingStrategy("Candle by Qaaf", "Lucknow", 10000, "leads")],
    ["Deep strategy", () => generateDeepStrategy("Candle by Qaaf", "Lucknow")],
    ["Competitor intel", () => generateCompetitorIntel("pricing_compare", "Rival Candles", "Candle by Qaaf", "Home fragrance")],
    ["Industry research", () => generateResearch("industry_trends", "Candle by Qaaf", "Home fragrance", "Lucknow")],
    ["Growth opportunities", () => generateGrowthOpportunities("Candle by Qaaf", "Home fragrance", "12 leads")],
    ["Budget recommendations", () => generateBudgetRecommendations("Candle by Qaaf", "Home fragrance", "2 campaigns")],
    ["Expansion strategy", () => generateExpansionStrategy("Candle by Qaaf", "Home fragrance", "Lucknow", 60, "12 leads")],
  ];
  it.each(cases)("%s", async (_name, run) => {
    const spy = anthropic(CREDITS);
    const r = await run();
    expect(r._fallback).toBe(true);
    expect(r._aiFailure).toEqual({ kind: "credits", message: OUTAGE });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a text placeholder becomes the approved message, never 'regenerate once the API is available'", async () => {
    anthropic(CREDITS);
    expect((await generateAdPlan("google", "audience_research", "Candle by Qaaf", "Home fragrance")).output).toEqual({ text: OUTAGE });
    expect((await generateResearch("market_research", "Candle by Qaaf", "Home fragrance", null)).output).toEqual({ text: OUTAGE });
  });

  it("Customer sentiment from real lead notes", async () => {
    anthropic(RATE);
    const notes = [1, 2, 3].map((i) => ({ qualificationReason: `note ${i}`, temperature: "warm", status: "new" }));
    expect(await generateSentimentFromLeads("Candle by Qaaf", "Home fragrance", notes)).toMatchObject({ _aiFailure: { kind: "rate_limited", message: BUSY }, output: { text: BUSY } });
  });

  it("Retargeting: the honest segment lines, marked as not written by the AI", async () => {
    anthropic(CREDITS);
    const copy = await generateRetargetingCopy("lapsed_buyer", "candle_by_qaaf", "Home fragrance", "20 past buyers");
    expect(copy).toMatchObject({ headline: "It's been a while", _aiFailure: { kind: "credits", message: OUTAGE } });
  });

  it("Brand profile from a description: defaults, marked", async () => {
    anthropic(CREDITS);
    expect(await analyzeDescription("We hand-pour soy candles in Lucknow")).toMatchObject({ _aiFailure: { kind: "credits" } });
  });

  it("campaign edits and goal plans: nothing proposed from a failed call", async () => {
    anthropic(CREDITS);
    expect(await matchCampaign([CAMPAIGN, { ...CAMPAIGN, id: "c2" }], "the diwali one")).toBeNull();
    expect(await proposeBudgetChange(CAMPAIGN, "double it")).toBeNull();
    expect(await proposeTargetingChange(CAMPAIGN, "women only")).toBeNull();
    expect(await decomposeGoal("100 leads by Diwali", "Candle by Qaaf", "Home fragrance", [])).toBeNull();
  });
});

describe("Optimization", () => {
  it("with real spend on the books, a failed review never claims there wasn't enough data", async () => {
    anthropic(CREDITS);
    const db: any = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { business_category: "Home fragrance" } }) }) }), insert: async () => ({}) }) };
    const r = await analyzeCampaigns(db, "d1");
    expect(r).toMatchObject({ hasEnoughData: true, recommendations: [], summary: OUTAGE, _aiFailure: { kind: "credits" } });
  });
});

describe("what still works as before", () => {
  it("web-search research: the text blocks between search results are read, and Research Credits are charged", async () => {
    anthropic(ok([
      { type: "server_tool_use", id: "s1", name: "web_search", input: {} },
      { type: "text", text: "Found it." },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
      { type: "text", text: '{"competitorPricing":[],"comparisonNotes":"No public prices."}' },
    ]));
    const r = await generateCompetitorIntel("pricing_compare", "Rival Candles", "Candle by Qaaf", "Home fragrance", { supabase: { from: () => ({ insert: async () => ({}) }) }, dealershipId: "d1" });
    expect(r).toEqual({ output: { competitorPricing: [], comparisonNotes: "No public prices." } });
    expect(credits).toHaveLength(1);
    expect(credits[0]).toBeGreaterThan(0);
  });

  it("research charges credits on success, not on failure", async () => {
    anthropic(CREDITS);
    await generateResearch("industry_trends", "Candle by Qaaf", "Home fragrance", null, { supabase: { from: () => ({ insert: async () => ({}) }) }, dealershipId: "d1" });
    expect(credits).toEqual([]);
  });

  it("a busy moment that clears on the retry gives the real answer", async () => {
    anthropic(RATE, ok([{ type: "text", text: '{"opportunities":[{"opportunity":"Corporate Diwali gifting","why":"3 of 12 leads asked"}]}' }]));
    expect(await generateGrowthOpportunities("Candle by Qaaf", "Home fragrance", "12 leads")).toEqual({ output: { opportunities: [{ opportunity: "Corporate Diwali gifting", why: "3 of 12 leads asked" }] } });
  });

  it("usage is logged against the business under the same operation name as before", async () => {
    const rows: any[] = [];
    const supabase = { from: (t: string) => ({ insert: async (row: any) => (rows.push({ t, ...row }), {}) }) };
    anthropic(ok([{ type: "text", text: '{"headline":"Still thinking?","primaryText":"Hand-poured soy.","cta":"Shop Now","variant2Headline":"Back again","variant2PrimaryText":"New scents."}' }]));
    await generateRetargetingCopy("cold_lead", "candle_by_qaaf", "Home fragrance", "5 cold leads", { supabase, dealershipId: "d1" });
    expect(rows).toEqual([expect.objectContaining({ t: "api_usage_logs", dealership_id: "d1", operation: "retargeting_copy", input_tokens: 100, output_tokens: 50 })]);
  });
});

describe("Strategy advice", () => {
  // Candle by Qaaf's thin 90 days: a handful of leads, nothing else yet.
  const diagnosis = () => buildDiagnosis({ models: ["products"], from: "2026-06-20", to: "2026-09-18", businessStart: "2026-01-01", events: [], leads: [{ id: "a", source: "instagram", status: "new" }], firstTouch: {}, orders: [], abandonedCarts: 0, atRisk: [], paid: null });

  it("credits out: the approved outage message, with the numbers still standing — and one call only", async () => {
    const spy = anthropic(CREDITS);
    const r = await generateChannelAdvice(diagnosis(), null);
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
    expect(ADVICE_FAILURE_MESSAGE.unavailable).toBe(`${OUTAGE} The numbers above are still accurate.`);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("busy twice: still one retry in total, not four calls", async () => {
    const spy = anthropic(RATE);
    expect(await generateChannelAdvice(diagnosis(), null)).toMatchObject({ ok: false, reason: "busy" });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
