// Every AI failure is named where it lands — chat, content, email, lead
// follow-ups, social captions, ad plans and Autopilot.
//
// THE LIVE CASE (2026-09-18): the Anthropic credits ran out. The chat said
// "Sorry, something went wrong on my end", the content and email pages
// offered a template that told the owner to "Regenerate once your
// Anthropic API key/quota is available", and Autopilot would have saved
// category templates as follow-up drafts and "new ad variants ready to
// review". Nobody at Hawlai was told.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserts: { table: string; row: Row }[];
let updates: { table: string; values: Row }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const rows = () => (op === "insert" ? [{ id: `${table}-new`, ...values }] : tables[table] ?? []);
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, or: () => api, ilike: () => api, neq: () => api, lte: () => api, gt: () => api,
      update: (v: Row) => ((op = "update"), (values = v), updates.push({ table, values: v }), api),
      insert: (v: Row) => ((op = "insert"), (values = v), inserts.push({ table, row: v }), api),
      upsert: (v: Row) => ((op = "insert"), (values = v), inserts.push({ table, row: v }), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

// The operator alert, and every other notification, lands here.
const notified: Row[] = [];
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async (_s: any, n: Row) => { notified.push(n); } }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/usage/generationLimits", async (orig) => ({
  ...(await orig<typeof import("@/lib/usage/generationLimits")>()),
  checkAndRecordGenerationUsage: async () => ({ allowed: true }),
}));
vi.mock("@/lib/plans", async (orig) => ({
  ...(await orig<typeof import("@/lib/plans")>()),
  getDealershipPlanLimits: async () => ({}),
  hasFeature: () => true,
  killSwitchFor: () => null,
}));
// Autopilot's other jobs — not what's under test here.
vi.mock("@/lib/agents/opportunityAgent", () => ({ syncOpportunities: async () => {} }));
vi.mock("@/lib/agents/analyticsAgent", () => ({
  snapshotCampaignPerformance: async () => 0,
  getCampaignPerformanceState: async () => ({ state: "not_connected" }),
}));
vi.mock("@/lib/agents/optimizationAgent", () => ({
  analyzeCampaigns: async () => ({ recommendations: [{ campaign_id: "loser", action: "pause", reason: "Cost per lead 3x the winner" }] }),
}));
vi.mock("@/lib/agents/campaignEditAgent", () => ({
  setCampaignStatus: async (_s: any, _d: string, c: Row, status: string) => {
    tables.ad_creatives.find((r) => r.id === c.id)!.meta_status = status;
    return { success: true };
  },
}));

import { runMasterBrainChat, executeTool } from "@/lib/agents/masterBrainV2";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";
import { generateFollowUpMessage } from "@/lib/agents/contentAgent";
import { generateSocialCaption } from "@/lib/agents/socialMediaAgent";
import { generateAdPlan } from "@/lib/adEngine";
import { runDailyAutopilot } from "@/lib/agents/autopilotAgent";
import { resetOperatorAlerts } from "@/lib/ai/claude";

const OUTAGE = "AI features are temporarily unavailable on our side — the Hawlai team has been alerted. Please try again later.";
const BUSY = "The AI service is busy — try again in a minute.";
const CREDITS = { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } };
const RATE = { type: "error", error: { type: "rate_limit_error", message: "rate limited" } };

/** Anthropic answering with each reply in turn (the last one repeats). */
function anthropic(...replies: { status: number; body: any }[]) {
  let n = 0;
  const spy = vi.fn(async (url: string) => {
    if (!String(url).includes("anthropic")) return new Response("{}", { status: 404 });
    const r = replies[Math.min(n++, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}
const ok = (text: string) => ({ status: 200, body: { content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 } } });
const creditsOut = { status: 400, body: CREDITS };

const CTX: any = { id: "d1", name: "Candle by Qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };
const operatorAlerts = () => notified.filter((n) => n.kind === "platform_ai_unavailable");

beforeEach(() => {
  tables = {
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
    profiles: [{ dealership_id: "admin-biz", is_platform_admin: true }],
  };
  inserts = [];
  updates = [];
  notified.length = 0;
  resetOperatorAlerts();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chat", () => {
  it("credits run out: the owner is told it's on our side, and Hawlai's admins are alerted", async () => {
    anthropic(creditsOut);
    const turn = await runMasterBrainChat(db(), "d1", [], "Diwali post banao");
    expect(turn.reply).toBe(OUTAGE);
    expect(operatorAlerts()).toEqual([expect.objectContaining({ dealershipId: "admin-biz", title: expect.stringMatching(/credit balance exhausted/) })]);
  });

  it("busy: 'try again in a minute' — not an outage, no alert", async () => {
    anthropic({ status: 429, body: RATE });
    const turn = await runMasterBrainChat(db(), "d1", [], "hi");
    expect(turn.reply).toBe(BUSY);
    expect(operatorAlerts()).toHaveLength(0);
  });

  it("a busy moment that clears on the retry is invisible to the owner", async () => {
    anthropic({ status: 529, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }, ok("Namaste! Kya banaun?"));
    expect((await runMasterBrainChat(db(), "d1", [], "hi")).reply).toBe("Namaste! Kya banaun?");
  });

  it("a content or email tool that can't reach the AI reports why, and saves nothing", async () => {
    anthropic(creditsOut);
    for (const [tool, input] of [["generate_content", { contentType: "instagram_post", topic: "Diwali" }], ["generate_email", { taskType: "promotional", topic: "Diwali" }]] as const) {
      expect(await executeTool(db(), CTX, tool, input, "")).toEqual({ error: OUTAGE });
    }
    expect(inserts.filter((i) => /content_pieces|email_marketing_pieces/.test(i.table))).toEqual([]);
  });
});

describe("the generators say why, and never mention Anthropic, keys or quota to the owner", () => {
  it("Content Marketing", async () => {
    anthropic(creditsOut);
    const r = await generateContent("instagram_post", "Candle by Qaaf", "Home fragrance", "Diwali");
    expect(r).toMatchObject({ _fallback: true, _aiFailure: { kind: "credits", message: OUTAGE }, output: { text: OUTAGE } });
  });

  it("Email", async () => {
    anthropic({ status: 429, body: RATE });
    const r = await generateEmailContent("promotional", "Candle by Qaaf", "Home fragrance", "Diwali");
    expect(r).toMatchObject({ _fallback: true, _aiFailure: { kind: "rate_limited", message: BUSY }, output: { text: BUSY } });
  });

  it("a revision pass that can't run keeps the first draft", async () => {
    anthropic(ok(JSON.stringify({ text: "First draft" })), creditsOut);
    const facts: any = { businessName: "Candle by Qaaf", ownerFacts: [], products: [], services: [], offers: [] };
    const r = await generateContent("instagram_post", "Candle by Qaaf", "Home fragrance", "Diwali", null, undefined, undefined, facts, "draft", { revise: true });
    expect(r._aiFailure).toBeUndefined();
    expect(r.revised).toBeUndefined();
  });

  it("a lead follow-up: the template comes back marked as one", async () => {
    anthropic(creditsOut);
    const r = await generateFollowUpMessage({ name: "Asha" }, null, "whatsapp");
    expect(r.aiFailure).toEqual({ kind: "credits", message: OUTAGE });
    expect(r.message).toMatch(/^Hi Asha/);
  });

  it("a social caption: the owner's own words, marked", async () => {
    anthropic(creditsOut);
    expect(await generateSocialCaption("Diwali candles are here", null)).toMatchObject({ caption: "Diwali candles are here", aiFailure: { kind: "credits" } });
  });

  it("an ad plan: the category template, marked — not presented as the AI's plan", async () => {
    anthropic(creditsOut);
    const plan: any = await generateAdPlan("Diwali ad", null, "Home fragrance", undefined, "Lucknow");
    expect(plan).toMatchObject({ headline: "Home fragrance in Lucknow", _aiFailure: { kind: "credits", message: OUTAGE } });
  });

  it("a normal reply carries no failure", async () => {
    anthropic(ok(JSON.stringify({ text: "Diwali pe ghar ko roshan karo" })));
    const r = await generateContent("instagram_post", "Candle by Qaaf", "Home fragrance", "Diwali");
    expect(r._fallback).toBeUndefined();
    expect(r._aiFailure).toBeUndefined();
  });
});

describe("Autopilot doesn't save templates as work", () => {
  const stuckLead = (id: string) => ({ id, name: `Lead ${id}`, status: "new", created_at: "2026-09-01T00:00:00Z", draft_followup_generated_at: null });

  it("follow-up drafts: none saved, and an outage stops the run after the first lead", async () => {
    tables.leads = [stuckLead("l1"), stuckLead("l2"), stuckLead("l3")];
    const spy = anthropic(creditsOut);
    const result = await runDailyAutopilot(db(), "d1");
    expect(result.drafted).toBe(0);
    expect(updates.filter((u) => u.table === "leads")).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("follow-up drafts when merely busy: skipped per lead, the run carries on", async () => {
    tables.leads = [stuckLead("l1"), stuckLead("l2")];
    const spy = anthropic({ status: 429, body: RATE });
    expect((await runDailyAutopilot(db(), "d1")).drafted).toBe(0);
    expect(spy).toHaveBeenCalledTimes(4); // two leads, one retry each
  });

  it("follow-up drafts when the AI works: saved as before", async () => {
    tables.leads = [stuckLead("l1")];
    anthropic(ok(JSON.stringify({ message: "Asha ji, Diwali ke liye lavender candle ready hai" })));
    expect((await runDailyAutopilot(db(), "d1")).drafted).toBe(1);
    expect(updates.find((u) => u.table === "leads")?.values.draft_followup_message).toBe("Asha ji, Diwali ke liye lavender candle ready hai");
  });

  it("a paused A/B loser: no template saved as a 'new variant ready to review'", async () => {
    tables.dealerships[0] = { ...tables.dealerships[0], auto_pause_low_performers: true, auto_generate_variant_on_pause: true };
    tables.ad_creatives = [
      { id: "loser", headline: "Old hook", meta_status: "ACTIVE", status: "launched", variant_group_id: "g1", variant_label: "A" },
      { id: "winner", headline: "Winning hook", meta_status: "ACTIVE", status: "launched", variant_group_id: "g1", variant_label: "B" },
    ];
    anthropic(creditsOut);
    await runDailyAutopilot(db(), "d1");
    expect(notified.some((n) => n.kind === "campaign_auto_paused")).toBe(true);
    expect(inserts.filter((i) => i.table === "ad_creatives")).toEqual([]);
    expect(notified.some((n) => n.kind === "variant_draft_generated")).toBe(false);
  });

  it("…and when the AI works, the variant is drafted as before", async () => {
    tables.dealerships[0] = { ...tables.dealerships[0], auto_pause_low_performers: true, auto_generate_variant_on_pause: true };
    tables.ad_creatives = [
      { id: "loser", headline: "Old hook", meta_status: "ACTIVE", status: "launched", variant_group_id: "g1", variant_label: "A" },
      { id: "winner", headline: "Winning hook", meta_status: "ACTIVE", status: "launched", variant_group_id: "g1", variant_label: "B" },
    ];
    anthropic(ok(JSON.stringify({ headline: "Ghar mein Diwali ki khushboo", body: "Hand-poured soy candles", confidence_score: 80 })));
    await runDailyAutopilot(db(), "d1");
    expect(inserts.filter((i) => i.table === "ad_creatives").map((i) => i.row.variant_label)).toEqual(["C"]);
  });
});
