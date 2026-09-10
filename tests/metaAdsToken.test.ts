// Every campaign-status path presents the SAME credential to Meta.
//
// WHY: the Analytics Status column showed "(#100) Missing Ads or
// Marketing Messages permission". Every Meta call used the Page token,
// the only Meta credential kept, and a Page token cannot read an ad
// account's campaigns or ad sets. The connect flow now keeps the user
// token (ads_read / ads_management), and one function decides which
// token a call uses. This pins that the Status column, activation,
// chat pause and the dashboard On/Off route all use it — so they can
// never again disagree about what Meta will let them see.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { metaUserTokenWrite, metaPageTokenWrite, readMetaUserToken } from "@/lib/crypto/oauthSecrets";
import { loadMetaAdsToken } from "@/lib/ads/metaToken";

// ---------------------------------------------------------------------
// A small in-memory database that really filters.
// ---------------------------------------------------------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};
let userColumnsMissing = false;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let cols = "*";
  const run = (): { data: Row[] | null; error: any } => {
    if (table === "dealerships" && userColumnsMissing && cols.includes("fb_user_access_token")) {
      return { data: null, error: { code: "42703", message: "column dealerships.fb_user_access_token_encrypted does not exist" } };
    }
    const matched = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (patch) for (const r of matched) Object.assign(r, patch);
    return { data: matched, error: null };
  };
  const api: any = {
    select: (c = "*") => { cols = c; return api; },
    update: (p: Row) => { patch = p; return api; },
    insert: (p: Row) => { (tables[table] ??= []).push({ id: `${table}-${(tables[table] ?? []).length + 1}`, ...p }); return api; },
    eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return api; },
    in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return api; },
    not: (c: string, op: string, v: any) => { if (op === "is" && v === null) filters.push((r) => r[c] != null); return api; },
    like: () => api,
    order: () => api,
    contains: () => api,
    single: async () => { const { data, error } = run(); if (error) return { data: null, error }; return data!.length === 1 ? { data: data![0], error: null } : { data: null, error: { message: "not one row" } }; },
    maybeSingle: async () => { const { data, error } = run(); if (error) return { data: null, error }; return { data: data![0] ?? null, error: null }; },
    then: (resolve: any) => resolve(run()),
  };
  return api;
}
const store = { from: (t: string) => query(t) };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from: (t: string) => query(t) }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (t: string) => query(t) }) }));

import { POST as statusColumn } from "@/app/api/ads/campaign-status/route";
import { PATCH as onOffSwitch } from "@/app/api/ads/[id]/status/route";
import { switchMetaCampaign } from "@/lib/agents/masterBrainV2";
import { createMetaPlatform } from "@/lib/publish/platforms/meta";

const C = "120254652336640260", S = "120254652336770260", A = "120254652337290260";
const ROW_ID = "24a8fff5-447d-4a69-924c-23b4e747c9f2";

function seed(opts: { userToken?: "valid" | "expired" | "none" } = {}) {
  const userToken =
    opts.userToken === "none" ? {} :
    opts.userToken === "expired" ? { ...metaUserTokenWrite("USER_TOKEN", 3600) } : // expires within the 1-day margin
    metaUserTokenWrite("USER_TOKEN", 60 * 24 * 3600);
  tables = {
    profiles: [{ id: "owner-1", dealership_id: "d1" }],
    dealerships: [{
      id: "d1", owner_id: "owner-1", approval_threshold: 50000,
      ...metaPageTokenWrite("PAGE_TOKEN"), ...userToken,
      fb_account_status: 1, fb_currency: "INR", fb_ad_account_id: "act_1", fb_page_id: "page-1",
    }],
    ad_creatives: [{
      id: ROW_ID, dealership_id: "d1", status: "launched", headline: "Ghar ko do lavender ki shanti", body_copy: "",
      plan_json: { car_type: "Lavender candle" }, daily_budget: 100, platform: "meta",
      meta_campaign_id: C, meta_adset_id: S, meta_ad_id: A, meta_status: "PAUSED", generated_image_url: null, created_at: "2026-09-09T10:00:00Z",
    }],
    publish_actions: [],
    pending_approvals: [],
  };
}

/** Graph, recording which token every call carried. */
function graph() {
  const tokens: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    const u = new URL(url);
    const node = u.pathname.split("/").pop()!;
    if (init?.method === "POST") {
      tokens.push(JSON.parse(init.body).access_token);
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    tokens.push(u.searchParams.get("access_token")!);
    const fields = u.searchParams.get("fields") ?? "";
    if (fields.includes("daily_budget")) return { ok: true, status: 200, json: async () => ({ id: node, daily_budget: node === S ? "10000" : "0", lifetime_budget: "0" }) };
    const level = node === C ? { status: "PAUSED", effective_status: "PAUSED" } : { status: "PAUSED", effective_status: "CAMPAIGN_PAUSED" };
    return { ok: true, status: 200, json: async () => ({ id: node, ...level, ...(node === A ? { campaign_id: C, adset_id: S } : {}) }) };
  }));
  return tokens;
}

/** Runs all four paths against the same business, returning the token each presented to Meta. */
async function tokensUsedByEveryPath() {
  const used: Record<string, string[]> = {};

  let t = graph();
  await statusColumn(new Request("https://hawlai.online/api/ads/campaign-status", { method: "POST", body: JSON.stringify({ ids: [ROW_ID] }) }));
  used.statusColumn = t;

  t = graph();
  await onOffSwitch(new Request(`https://hawlai.online/api/ads/${ROW_ID}/status`, { method: "PATCH", body: JSON.stringify({ status: "PAUSED" }) }), { params: Promise.resolve({ id: ROW_ID }) });
  used.onOffSwitch = t;

  t = graph();
  await switchMetaCampaign("pause", { id: "d1" }, store, { campaign_description: "lavender" });
  used.chatPause = t;

  t = graph();
  await createMetaPlatform({ supabase: store as any }).preview({
    id: "pa-1", dealershipId: "d1", platform: "meta", connectionRef: null, actionKey: "activate_ad_campaign",
    targetRef: ROW_ID, targetLabel: "x", requestedChanges: { status: "ACTIVE" }, preview: null, previewedAt: null,
    status: "draft", idempotencyKey: "k",
  });
  used.activationPreview = t;

  return used;
}

beforeEach(() => { userColumnsMissing = false; });
afterEach(() => vi.unstubAllGlobals());

describe("one credential, every path", () => {
  it("with a user token stored: the Status column, the On/Off switch, chat pause and activation ALL present it to Meta", async () => {
    seed({ userToken: "valid" });
    const used = await tokensUsedByEveryPath();
    for (const [path, tokens] of Object.entries(used)) {
      expect(tokens.length, `${path} made no Meta calls`).toBeGreaterThan(0);
      expect(new Set(tokens), `${path} used a different credential`).toEqual(new Set(["USER_TOKEN"]));
    }
  });

  it("with no user token (not reconnected yet): all four fall back to the SAME Page token", async () => {
    seed({ userToken: "none" });
    const used = await tokensUsedByEveryPath();
    for (const [path, tokens] of Object.entries(used)) {
      expect(new Set(tokens), path).toEqual(new Set(["PAGE_TOKEN"]));
    }
  });
});

describe("choosing the token", () => {
  it("prefers the stored user token", async () => {
    seed({ userToken: "valid" });
    expect(await loadMetaAdsToken(store, "d1")).toEqual({ token: "USER_TOKEN", kind: "user" });
  });

  it("never hands out a user token about to expire — falls back to the Page token", async () => {
    seed({ userToken: "expired" });
    expect(await loadMetaAdsToken(store, "d1")).toEqual({ token: "PAGE_TOKEN", kind: "page" });
  });

  it("migration 177 not run yet → the Page token, NOT 'Facebook isn't connected'", async () => {
    seed({ userToken: "none" });
    userColumnsMissing = true;
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await loadMetaAdsToken(store, "d1")).toEqual({ token: "PAGE_TOKEN", kind: "page" });
  });

  it("neither token → null", async () => {
    seed({ userToken: "none" });
    tables.dealerships[0].fb_page_access_token_encrypted = null;
    expect(await loadMetaAdsToken(store, "d1")).toBeNull();
  });

  it("the user token is stored encrypted only, with its expiry", () => {
    const write = metaUserTokenWrite("USER_TOKEN", 5184000);
    expect(Object.keys(write).sort()).toEqual(["fb_user_access_token_encrypted", "fb_user_token_expires_at"]);
    expect(write.fb_user_access_token_encrypted).not.toContain("USER_TOKEN");
    expect(readMetaUserToken(write)).toBe("USER_TOKEN");
  });
});
