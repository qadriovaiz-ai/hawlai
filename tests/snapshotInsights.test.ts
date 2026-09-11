// The daily snapshot's Meta figures — spend, impressions, clicks — are
// read the permission-safe, retry-safe way, and a failed read is never
// recorded as zero.
//
// WHY: each snapshot is a RUNNING TOTAL (campaignHistory.ts). The old
// insights fetch used the Page token (which can't read an ad account's
// campaigns), didn't retry, and wrote 0 on any failure — and a 0 in a
// running total reads the next day as the campaign's entire spend
// arriving at once.

import { describe, it, expect, vi, afterEach } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { snapshotCampaignPerformance } from "@/lib/agents/analyticsAgent";
import { metaUserTokenWrite } from "@/lib/crypto/oauthSecrets";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const C = "120254652336640260", S = "120254652336770260", A = "120254652337290260";

function db(dealership: Record<string, any>) {
  const upserts: any[] = [];
  const data: Record<string, any> = {
    dealerships: dealership,
    ad_creatives: [{ id: "row-1", headline: "Ghar ko do lavender ki shanti", meta_campaign_id: C, meta_adset_id: S, meta_ad_id: A, meta_status: "PAUSED" }],
    leads: [],
    orders: [],
  };
  const client = {
    from: (table: string) => {
      let op: "select" | "update" = "select";
      const api: any = {
        select: () => api, eq: () => api, not: () => api, in: () => api,
        single: async () => ({ data: data[table], error: null }),
        maybeSingle: async () => ({ data: data[table], error: null }),
        upsert: async (rows: any[]) => { upserts.push(...rows); return { error: null }; },
        update: () => { op = "update"; return api; },
        then: (resolve: any) => resolve(op === "update" ? { data: null, error: null } : { data: data[table] ?? [], error: null }),
      };
      return api;
    },
  };
  return { client, upserts };
}

type InsightsReply = "ok" | "empty" | "transient" | "permission";

function graph(insights: InsightsReply[]) {
  const insightTokens: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/insights")) {
      insightTokens.push(u.searchParams.get("access_token")!);
      expect(u.searchParams.get("date_preset")).toBe("maximum");
      const reply = insights.length > 1 ? insights.shift()! : insights[0];
      if (reply === "transient") return { ok: false, status: 500, json: async () => ({ error: { message: "An unexpected error has occurred. Please retry your request later.", is_transient: true, code: 2 } }) };
      if (reply === "permission") return { ok: false, status: 400, json: async () => ({ error: { message: "(#100) Missing Ads or Marketing Messages permission", type: "OAuthException", code: 100 } }) };
      if (reply === "empty") return { ok: true, status: 200, json: async () => ({ data: [] }) };
      return { ok: true, status: 200, json: async () => ({ data: [{ spend: "100.00", impressions: "4000", clicks: "80", ctr: "2" }] }) };
    }
    const node = u.pathname.split("/").pop()!;
    const lvl = node === C ? { status: "PAUSED", effective_status: "PAUSED" } : { status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" };
    return { ok: true, status: 200, json: async () => ({ id: node, ...lvl, ...(node === A ? { campaign_id: C, adset_id: S } : {}) }) };
  }));
  return insightTokens;
}

const PAGE_ONLY = { fb_page_access_token: "PAGE_TOKEN", fb_page_access_token_encrypted: null };

describe("the snapshot's Meta figures", () => {
  it("readable → recorded as Meta's numbers", async () => {
    graph(["ok"]);
    const { client, upserts } = db(PAGE_ONLY);
    await snapshotCampaignPerformance(client, "d1");
    expect(upserts[0]).toMatchObject({ spend: 100, impressions: 4000, clicks: 80 });
  });

  it("unreadable (the permission error) → null, NEVER 0 — leads and revenue still recorded", async () => {
    graph(["permission"]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, upserts } = db(PAGE_ONLY);
    await snapshotCampaignPerformance(client, "d1");
    expect(upserts[0].spend).toBeNull();
    expect(upserts[0].impressions).toBeNull();
    expect(upserts[0].clicks).toBeNull();
    expect(upserts[0].leads).toBe(0);
  });

  it("a transient error is retried, and the real figures recorded", async () => {
    const tokens = graph(["transient", "ok"]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { client, upserts } = db(PAGE_ONLY);
    await snapshotCampaignPerformance(client, "d1");
    expect(tokens).toHaveLength(2);
    expect(upserts[0].spend).toBe(100);
  });

  it("nothing delivered yet (an empty insights list) is a real zero, not unknown", async () => {
    graph(["empty"]);
    const { client, upserts } = db(PAGE_ONLY);
    await snapshotCampaignPerformance(client, "d1");
    expect(upserts[0]).toMatchObject({ spend: 0, impressions: 0, clicks: 0 });
  });

  it("insights are read with the user token when one is stored — the one that can read campaigns", async () => {
    const tokens = graph(["ok"]);
    const { client } = db({ ...PAGE_ONLY, ...metaUserTokenWrite("USER_TOKEN", 60 * 24 * 3600) });
    await snapshotCampaignPerformance(client, "d1");
    expect(new Set(tokens)).toEqual(new Set(["USER_TOKEN"]));
  });
});
