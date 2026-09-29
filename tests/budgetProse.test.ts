// The prose around the Budget Simulator card, held to what the card said.
//
// Asked "₹50,000 hai, kya karun", the arithmetic was right and the
// sentences around it were not. Chat put ₹12,500 into Local SEO with a
// reason the card never gave, said "I can do both from here" about work
// that includes Google Business Profile — which Hawlai cannot touch at
// all — and offered to launch a Meta campaign without knowing whether
// this business has a usable ad account.
//
// A made-up rationale is worse than no rationale: the owner acts on the
// reason, not the number.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

const world = { adAccount: null as any };

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/strategy/fitInput", () => ({ loadFitInput: async () => ({ diagnosis: null }) }));
vi.mock("@/lib/strategy/channelFit", () => ({
  channelFit: () => [
    { channel: "local_seo", label: "Local SEO", standing: "fits", reasons: ["people search for this in Shahjahanpur"], needs: [], measure: "impressions" },
    { channel: "meta_ads", label: "Facebook / Instagram ads", standing: "test", reasons: ["nothing behind it yet"], needs: [], measure: "cost per lead" },
    { channel: "google_search", label: "Google Search ads", standing: "test", reasons: [], needs: [], measure: "cost per lead" },
  ],
}));
vi.mock("@/lib/strategy/simulator", () => ({
  simulate: () => ({ thin: null, scenarios: [{ split: [{ channel: "local_seo", amount: 12500 }] }], projectedLeads: null, unknowns: ["cost per lead"] }),
}));

import { executeTool, TOOLS } from "@/lib/agents/masterBrainV2";

const CTX: any = { id: "d1", name: "Candle by Qaaf", city: "Shahjahanpur", category: "candles", team: [], toneOfVoice: null };
const db = () => ({
  from: () => {
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: world.adAccount }) };
    return chain;
  },
});

describe("what the card lets chat offer", () => {
  it("says Hawlai cannot touch Google Business Profile", async () => {
    world.adAccount = null;
    const result = await executeTool(db(), CTX, "plan_budget", { budgetInr: 50000 }, "");
    const localSeo = result.channels.find((c: any) => c.channel === "local_seo");
    expect(localSeo.hawlaiCanDo).toMatch(/CANNOT touch Google Business Profile/);
    expect(localSeo.hawlaiCanDo).toMatch(/^PARTLY/);
  });

  it("REFUSES to offer a Meta launch when there is no usable ad account", async () => {
    world.adAccount = { fb_ad_account_id: null, fb_account_status: null };
    const result = await executeTool(db(), CTX, "plan_budget", { budgetInr: 50000 }, "");
    const meta = result.channels.find((c: any) => c.channel === "meta_ads");
    expect(meta.hawlaiCanDo).toMatch(/^NO —/);
    expect(meta.hawlaiCanDo).toMatch(/do not offer to launch anything/);
  });

  it("allows it when the account is connected and usable", async () => {
    // Status 1 is ACTIVE in Meta's own vocabulary.
    world.adAccount = { fb_ad_account_id: "act_123", fb_account_status: 1, fb_min_daily_budget: 9491, fb_currency: "INR" };
    const result = await executeTool(db(), CTX, "plan_budget", { budgetInr: 50000 }, "");
    expect(result.channels.find((c: any) => c.channel === "meta_ads").hawlaiCanDo).toMatch(/^YES/);
  });

  it("does not claim Google Ads can be run from here", async () => {
    world.adAccount = null;
    const result = await executeTool(db(), CTX, "plan_budget", { budgetInr: 50000 }, "");
    const google = result.channels.find((c: any) => c.channel === "google_search");
    expect(google.hawlaiCanDo).toMatch(/^NO — Hawlai has no Google Ads integration/);
  });

  it("tells the model to use the card's own reasons and add none", async () => {
    world.adAccount = null;
    const result = await executeTool(db(), CTX, "plan_budget", { budgetInr: 50000 }, "");
    expect(result.note).toMatch(/use those words and add no reasoning of your own/);
    expect(result.note).toMatch(/a rationale you supply is one the arithmetic never made/);
    expect(result.note).toMatch(/read that channel's `hawlaiCanDo`/);
    // The rule it already had stays.
    expect(result.note).toMatch(/splits, not forecasts/);
  });

  it("carries each channel's own reasons through untouched", async () => {
    world.adAccount = null;
    const result = await executeTool(db(), CTX, "plan_budget", { budgetInr: 50000 }, "");
    expect(result.channels.find((c: any) => c.channel === "local_seo").reasons).toEqual(["people search for this in Shahjahanpur"]);
  });

  it("the tool description still says what it is", () => {
    const tool: any = TOOLS.find((t: any) => t.name === "plan_budget");
    expect(tool.description).toMatch(/splits, NOT forecasts|these are splits/i);
  });
});
