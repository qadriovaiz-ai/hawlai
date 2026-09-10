// /api/ads/campaign-status — the live Status for the performance history.
//
// Runs the real route, readCampaignState and describeDelivery. Only the
// database (in-memory, really filters by business) and Meta's HTTP API
// (Graph's real response shapes) are stand-ins.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};
let signedIn = true;
const updates: Row[] = [];

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  const run = () => {
    const matched = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (patch) {
      for (const r of matched) Object.assign(r, patch);
      updates.push({ table, ...patch, ids: matched.map((r) => r.id) });
    }
    return matched;
  };
  const api: any = {
    select: () => api,
    update: (p: Row) => { patch = p; return api; },
    eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return api; },
    in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return api; },
    single: async () => { const m = run(); return m.length === 1 ? { data: m[0], error: null } : { data: null, error: { message: "not one row" } }; },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: run(), error: null }),
  };
  return api;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: "owner-1" } : null } }) },
    from: (t: string) => query(t),
  }),
}));

import { POST } from "@/app/api/ads/campaign-status/route";

const C = "120254652336640260", S = "120254652336770260", A = "120254652337290260";

function seed(opts: { token?: boolean; metaStatus?: string } = {}) {
  tables = {
    profiles: [{ id: "owner-1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", fb_page_access_token: opts.token === false ? null : "PAGE_TOKEN", fb_page_access_token_encrypted: null, fb_currency: "INR" }],
    ad_creatives: [
      { id: "row-1", dealership_id: "d1", meta_campaign_id: C, meta_adset_id: S, meta_ad_id: A, meta_status: opts.metaStatus ?? "PAUSED" },
      // Another business's campaign — must never be returned.
      { id: "row-other", dealership_id: "d2", meta_campaign_id: "X", meta_adset_id: "Y", meta_ad_id: "Z", meta_status: "ACTIVE" },
    ],
  };
  updates.length = 0;
}

type Level = { status: string; effective_status: string } | "gone" | "down";

/** Graph, answering per node. The ad names its parents, as Graph does. */
function graph(levels: { campaign: Level; adset: Level; ad: Level }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const node = String(url).split("/v23.0/")[1].split("?")[0];
    // Budget reads: Graph's shape, minor units as strings, on the ad set.
    if (String(url).includes("fields=daily_budget")) {
      return { ok: true, status: 200, json: async () => ({ id: node, daily_budget: node === S ? "10000" : "0", lifetime_budget: "0" }) };
    }
    calls.push(node);
    const lv = node === C ? levels.campaign : node === S ? levels.adset : node === A ? levels.ad : "gone";
    if (lv === "down") {
      return { ok: false, status: 500, json: async () => ({ error: { message: "An unexpected error has occurred. Please retry your request later.", type: "OAuthException", is_transient: true, code: 2 } }) };
    }
    if (lv === "gone") {
      return { ok: false, status: 400, json: async () => ({ error: { message: `Unsupported get request. Object with ID '${node}' does not exist, cannot be loaded due to missing permissions, or does not support this operation.`, type: "GraphMethodException", code: 100, error_subcode: 33 } }) };
    }
    return { ok: true, status: 200, json: async () => ({ id: node, ...lv, ...(node === A ? { campaign_id: C, adset_id: S } : {}) }) };
  }));
  return calls;
}

const on = { status: "ACTIVE", effective_status: "ACTIVE" };

async function ask(ids: unknown = ["row-1", "row-other"]) {
  const res = await POST(new Request("https://hawlai.online/api/ads/campaign-status", { method: "POST", body: JSON.stringify({ ids }) }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => { seed(); signedIn = true; });
afterEach(() => vi.unstubAllGlobals());

describe("live status per campaign", () => {
  it("all three delivering → active, checked now — and Hawlai's stale PAUSED record is corrected", async () => {
    graph({ campaign: on, adset: on, ad: on });
    const { body } = await ask();
    expect(body.statuses["row-1"]).toMatchObject({ state: "active", label: "Active" });
    expect(body.statuses["row-1"].checkedAt).toBeTruthy();
    expect(tables.ad_creatives.find((r) => r.id === "row-1")!.meta_status).toBe("ACTIVE");
  });

  it("the campaign is Off in Ads Manager → paused", async () => {
    graph({ campaign: { status: "PAUSED", effective_status: "PAUSED" }, adset: { status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" }, ad: { status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" } });
    const { body } = await ask();
    expect(body.statuses["row-1"].state).toBe("paused");
  });

  it("deleted on Meta, and Meta still answers → Deleted on Meta", async () => {
    graph({ campaign: { status: "DELETED", effective_status: "DELETED" }, adset: { status: "DELETED", effective_status: "CAMPAIGN_DELETED" }, ad: { status: "DELETED", effective_status: "DELETED" } });
    const { body } = await ask();
    expect(body.statuses["row-1"].state).toBe("deleted");
  });

  // Both seeded with a local "ACTIVE": the harmful case is overwriting —
  // or keeping as if confirmed — a status Meta hasn't given. With a
  // local PAUSED these passed even when the route wrote PAUSED on every
  // failure; a mutation check caught that they asserted nothing.
  it("gone from Meta entirely (100/33) → Not found on Meta, and Hawlai's record left alone", async () => {
    seed({ metaStatus: "ACTIVE" });
    graph({ campaign: "gone", adset: "gone", ad: "gone" });
    const { body } = await ask();
    expect(body.statuses["row-1"].state).toBe("not_found");
    expect(updates).toEqual([]);
    expect(tables.ad_creatives.find((r) => r.id === "row-1")!.meta_status).toBe("ACTIVE");
  });

  it("Meta down (after retries) → unknown with no checkedAt, and Hawlai's record left alone", async () => {
    seed({ metaStatus: "ACTIVE" });
    const calls = graph({ campaign: "down", adset: "down", ad: "down" });
    const { body } = await ask();
    expect(body.statuses["row-1"]).toMatchObject({ state: "unknown", checkedAt: null });
    expect(calls.filter((n) => n === A).length).toBe(3); // retried, not reported on the first failure
    expect(updates).toEqual([]);
    expect(tables.ad_creatives.find((r) => r.id === "row-1")!.meta_status).toBe("ACTIVE");
  });

  it("no Facebook connection → every row unknown, saying why, without calling Meta", async () => {
    seed({ token: false });
    const calls = graph({ campaign: on, adset: on, ad: on });
    const { body } = await ask();
    expect(body.statuses["row-1"]).toMatchObject({ state: "unknown", detail: "Facebook isn't connected" });
    expect(calls).toEqual([]);
  });
});

describe("the On/Off switch's confirmation", () => {
  it("includeBudget → Meta's budget in words, for the 'Start?' confirmation", async () => {
    graph({ campaign: { status: "PAUSED", effective_status: "PAUSED" }, adset: { status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" }, ad: { status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" } });
    const res = await POST(new Request("https://hawlai.online/api/ads/campaign-status", { method: "POST", body: JSON.stringify({ ids: ["row-1"], includeBudget: true }) }));
    const body = await res.json();
    expect(body.statuses["row-1"]).toMatchObject({ state: "paused", budget: "₹100.00/day" });
  });

  it("without includeBudget, no budget is read", async () => {
    graph({ campaign: on, adset: on, ad: on });
    const { body } = await ask(["row-1"]);
    expect(body.statuses["row-1"]).not.toHaveProperty("budget");
  });
});

describe("the route is scoped and bounded", () => {
  it("another business's campaign id is never returned", async () => {
    graph({ campaign: on, adset: on, ad: on });
    const { body } = await ask();
    expect(Object.keys(body.statuses)).toEqual(["row-1"]);
  });

  it("signed out → 401; bad body → 400; no ids → empty", async () => {
    signedIn = false;
    expect((await ask()).status).toBe(401);
    signedIn = true;
    const bad = await POST(new Request("https://hawlai.online/api/ads/campaign-status", { method: "POST", body: "not json" }));
    expect(bad.status).toBe(400);
    expect((await ask([])).body).toEqual({ statuses: {} });
  });
});
