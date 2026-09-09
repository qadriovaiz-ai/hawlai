// A campaign on Meta that the dashboard cannot see is not launched.
//
// THE SYMPTOM: campaign 120254652336640260 existed on real Meta, paused,
// verified in the logs — and /dashboard → My Campaigns said "No
// campaigns launched yet". Both dashboard queries filter
// ad_creatives on status = 'launched', so the local row IS the campaign
// list. Meta is only asked for the numbers.
//
// The update that writes that row did not destructure its error.
// Supabase returns { data, error } and does not throw, so a failed
// write read as a successful one and launch.done logged success over
// the top of it. Same shape as the unchecked storage upload earlier in
// this work — the third time this pattern has cost a diagnosis.

import { describe, it, expect, vi, afterEach } from "vitest";
import { launchPausedCampaign } from "@/lib/ads/launchCampaign";

vi.mock("@/lib/adEngine", () => ({
  GRAPH_VERSION: "v23.0",
  metaPost: vi.fn(async (path: string) => {
    if (path.endsWith("/adimages")) return { images: { bytes: { hash: "H" } } };
    if (path.endsWith("/adcreatives")) return { id: "creative_1" };
    if (path.endsWith("/campaigns")) return { id: "120254652336640260" };
    if (path.endsWith("/adsets")) return { id: "120254652336770260" };
    if (path.endsWith("/ads")) return { id: "120254652337290260" };
    return {};
  }),
}));

vi.mock("@/lib/ads/metaTargeting", () => ({
  buildMetaTargeting: vi.fn(async () => ({
    targeting: { geo_locations: { countries: ["IN"] } },
    specialAdCategory: "NONE",
    summary: "All India",
    personaApplied: false,
  })),
}));

afterEach(() => vi.restoreAllMocks());

/** Records the ad_creatives update, and can be told to fail it. */
function db(opts: { updateFails?: boolean; matchesNoRow?: boolean } = {}) {
  const updates: any[] = [];
  return {
    updates,
    client: {
      from: () => {
        let patch: any = null;
        const api: any = {
          select: () => api,
          eq: () => api,
          update: (fields: any) => { patch = fields; updates.push(fields); return api; },
          single: async () =>
            opts.updateFails
              ? { data: null, error: { message: "column \"platform\" does not exist" } }
              : opts.matchesNoRow
                ? { data: null, error: null }
                : { data: { id: "draft-1", ...patch }, error: null },
        };
        return api;
      },
    },
  };
}

const ctx = (client: any) => ({
  serviceClient: client,
  dealershipId: "d1",
  dealership: { business_category: "candles", fb_min_daily_budget: 9491, fb_currency: "INR" },
  adAccount: "act_1568276064894949",
  pageAccessToken: "TOKEN",
  pageId: "page_1",
  leadFormId: null,
  brandProfile: null,
  plan: { headline: "Lavender Candle Sale", body: "x", daily_budget: 100, targeting_city: null },
  draft: { id: "draft-1" },
  finalBuffer: Buffer.from("png"),
  publicUrl: "https://cdn/ad.png",
  destination: {
    kind: "product_page" as const,
    url: "https://hawlai.online/site/candle-by-qaaf/products/p1",
    leadFormId: null,
    objective: "OUTCOME_TRAFFIC" as const,
    optimizationGoal: "LINK_CLICKS" as const,
    promotedObject: null,
    label: "Your product page",
    objectiveLabel: "Traffic",
  },
});

describe("a successful launch leaves a row the dashboard can find", () => {
  it("writes status 'launched' — the exact filter both campaign queries use", async () => {
    // /dashboard/ads/campaigns and getCampaignPerformanceState both do
    // .eq("status", "launched"). A row in any other state is invisible.
    const d = db();
    await launchPausedCampaign(ctx(d.client) as any);

    const saved = d.updates.find((u) => u.meta_ad_id);
    expect(saved).toBeDefined();
    expect(saved.status).toBe("launched");
  });

  it("stores every Meta id the dashboard and the activate route need", async () => {
    const d = db();
    await launchPausedCampaign(ctx(d.client) as any);
    const saved = d.updates.find((u) => u.meta_ad_id);

    // getCampaignPerformanceState also requires meta_campaign_id to be
    // non-null — it filters .not("meta_campaign_id", "is", null).
    expect(saved.meta_campaign_id).toBe("120254652336640260");
    expect(saved.meta_adset_id).toBe("120254652336770260");
    expect(saved.meta_ad_id).toBe("120254652337290260");
    expect(saved.meta_status).toBe("PAUSED");
    expect(saved.external_status).toBe("PAUSED");
  });

  it("returns the saved row rather than a bare success", async () => {
    const d = db();
    const result = await launchPausedCampaign(ctx(d.client) as any);
    expect(result.updated).toBeTruthy();
    expect(result.campaignId).toBe("120254652336640260");
  });
});

describe("a launch that cannot be saved locally does NOT report success", () => {
  it("THROWS when the update errors, naming the campaign that exists on Meta", async () => {
    // The bug. Previously the error was not even destructured, so this
    // returned normally and launch.done logged success — leaving a live
    // paused campaign that the product could not show, list or stop.
    const d = db({ updateFails: true });
    await expect(launchPausedCampaign(ctx(d.client) as any)).rejects.toThrow(/created on Meta \(120254652336640260\)/);
  });

  it("names the underlying cause, not just that something went wrong", async () => {
    const d = db({ updateFails: true });
    await expect(launchPausedCampaign(ctx(d.client) as any)).rejects.toThrow(/column "platform" does not exist/);
  });

  it("throws when the update matched no row at all", async () => {
    // No error, no data — a filter that matched nothing. Just as
    // invisible, and previously just as silent.
    const d = db({ matchesNoRow: true });
    await expect(launchPausedCampaign(ctx(d.client) as any)).rejects.toThrow(/couldn't be saved to your dashboard/);
  });
});
