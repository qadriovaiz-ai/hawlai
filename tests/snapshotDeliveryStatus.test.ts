// The daily snapshot records each campaign's delivery status — without
// ever putting the snapshot itself at risk.
//
// WHY THE SEPARATION MATTERS: migrations here are run by hand, and one
// (140) ran late. Its missing columns failed a save that depended on
// them, every time, silently. The delivery columns come from migration
// 176. If they were folded into the snapshot upsert, the history would
// stop recording entirely until 176 ran. So the status is a separate,
// best-effort write after the snapshot is saved.

import { describe, it, expect, vi, afterEach } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { snapshotCampaignPerformance } from "@/lib/agents/analyticsAgent";

afterEach(() => vi.unstubAllGlobals());

const C = "120254652336640260", S = "120254652336770260", A = "120254652337290260";

function db(opts: { deliveryColumnsExist: boolean }) {
  const upserts: any[] = [];
  const updates: any[] = [];
  const data: Record<string, any> = {
    dealerships: { fb_page_access_token: "PAGE_TOKEN", fb_page_access_token_encrypted: null },
    ad_creatives: [{ id: "row-1", headline: "Ghar ko do lavender ki shanti", meta_campaign_id: C, meta_adset_id: S, meta_ad_id: A, meta_status: "PAUSED" }],
    leads: [],
    orders: [],
  };
  const client = {
    from: (table: string) => {
      let op: "select" | "update" = "select";
      let patch: any = null;
      const api: any = {
        select: () => api, eq: () => api, not: () => api, in: () => api,
        single: async () => ({ data: data[table], error: null }),
        maybeSingle: async () => ({ data: data[table], error: null }),
        upsert: async (rows: any[]) => { upserts.push(...rows); return { error: null }; },
        update: (p: any) => { op = "update"; patch = p; return api; },
        then: (resolve: any) => {
          if (op === "update") {
            if (!opts.deliveryColumnsExist && "delivery_status" in patch) {
              return resolve({ data: null, error: { code: "42703", message: 'column "delivery_status" of relation "campaign_performance_history" does not exist' } });
            }
            updates.push({ table, ...patch });
            return resolve({ data: null, error: null });
          }
          return resolve({ data: data[table] ?? [], error: null });
        },
      };
      return api;
    },
  };
  return { client, upserts, updates };
}

function graph() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/insights")) return { ok: true, status: 200, json: async () => ({ data: [{ spend: "100", impressions: "1000", clicks: "20", ctr: "2" }] }) };
    const node = u.split("/v23.0/")[1].split("?")[0];
    const paused = node === C ? { status: "PAUSED", effective_status: "PAUSED" } : { status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" };
    return { ok: true, status: 200, json: async () => ({ id: node, ...paused, ...(node === A ? { campaign_id: C, adset_id: S } : {}) }) };
  }));
}

describe("the snapshot records delivery status as a separate step", () => {
  it("with migration 176 run: the snapshot is saved, then stamped 'paused' as Meta reports it", async () => {
    graph();
    const { client, upserts, updates } = db({ deliveryColumnsExist: true });
    const saved = await snapshotCampaignPerformance(client, "d1");

    expect(saved).toBe(1);
    // The snapshot itself never carries the new columns.
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).not.toHaveProperty("delivery_status");
    expect(upserts[0].spend).toBe(100);
    expect(updates).toEqual([{ table: "campaign_performance_history", delivery_status: "paused", delivery_detail: null }]);
  });

  it("WITHOUT migration 176: the snapshot is still saved — only the status is lost", async () => {
    graph();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, upserts } = db({ deliveryColumnsExist: false });
    const saved = await snapshotCampaignPerformance(client, "d1");

    expect(saved).toBe(1);
    expect(upserts).toHaveLength(1);
  });
});
