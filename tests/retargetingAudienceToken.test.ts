// Retargeting R1 (2026-09-20): Custom Audiences — create, upload, count —
// use the USER token, never the Page token.
//
// WHY: audiences are ad-account objects, and a Page token can't manage
// them. The route used the Page token, and "ready" meant "has a Page
// token", so the page offered a sync that could only fail at Meta. Now:
// ready needs a usable user token; an expired one says "reconnect" and
// sends nothing; Meta's own "token expired" (190) says the same.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { metaUserTokenWrite, metaPageTokenWrite } from "@/lib/crypto/oauthSecrets";
import { AUDIENCE_TOKEN_EXPIRED, AUDIENCE_TOKEN_PAGE_ONLY, AUDIENCE_TOKEN_MISSING, loadMetaAudienceToken } from "@/lib/ads/metaToken";

type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "upsert" = "select";
  let payload: Row | null = null;
  const run = () => {
    if (op === "upsert") {
      const rows = (tables[table] ??= []);
      const i = rows.findIndex((r) => r.dealership_id === payload!.dealership_id && r.audience_key === payload!.audience_key);
      if (i >= 0) rows[i] = { ...rows[i], ...payload }; else rows.push({ id: `${table}-${rows.length + 1}`, ...payload });
      return { data: null, error: null };
    }
    const matched = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    return { data: matched, error: null };
  };
  const api: any = {
    select: () => api, order: () => api, limit: () => api, gte: () => api, in: () => api, not: () => api, neq: () => api, is: () => api, or: () => api,
    upsert: (p: Row) => ((op = "upsert"), (payload = p), api),
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), api),
    single: async () => { const { data } = run(); return { data: data?.[0] ?? null, error: null }; },
    maybeSingle: async () => { const { data } = run(); return { data: data?.[0] ?? null, error: null }; },
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return api;
}
const client = () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from: (t: string) => query(t) });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => client() }));

import { GET, POST } from "@/app/api/retargeting/audiences/route";

const USER = "user-token-abc";
const PAGE = "page-token-xyz";

function seed(userToken: "valid" | "expired" | "none", page = true) {
  const user =
    userToken === "none"
      ? {}
      : { ...metaUserTokenWrite(USER, 60 * 24 * 60 * 60), ...(userToken === "expired" ? { fb_user_token_expires_at: new Date(Date.now() - 60_000).toISOString() } : {}) };
  tables = {
    profiles: [{ id: "owner-1", dealership_id: "d1" }],
    dealerships: [
      { id: "d1", owner_id: "owner-1", fb_ad_account_id: "123", meta_pixel_id: "px1", ...(page ? metaPageTokenWrite(PAGE) : {}), ...user },
      // Another business's valid token must never be used for d1.
      { id: "d2", owner_id: "owner-2", fb_ad_account_id: "999", meta_pixel_id: "px2", ...metaUserTokenWrite("other-business-token", 3600 * 24 * 30) },
    ],
    meta_custom_audiences: [],
    orders: [{ dealership_id: "d1", customer_phone: "9876543210", customer_email: "a@b.in", status: "paid" }],
  };
}

/** Meta: records every call and the token it carried. */
let calls: { url: string; token: string | null }[];
function meta(reply: (url: string) => { status: number; body: any } = () => ({ status: 200, body: { id: "aud-1", approximate_count_lower_bound: 1200 } })) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    const token = body?.access_token ?? new URL(url).searchParams.get("access_token");
    calls.push({ url, token });
    const r = reply(url);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
}
const post = (audienceKey: string) => POST(new Request("https://hawlai.test/api/retargeting/audiences", { method: "POST", body: JSON.stringify({ audienceKey }) }));

beforeEach(() => meta());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which token audiences use", () => {
  it("a valid user token: create and count both carry it — never the Page token", async () => {
    seed("valid");
    const res = await post("abandoned_cart");
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.token)).toEqual([USER, USER]);
    expect(calls[0].url).toContain("/act_123/customaudiences");
    expect(calls[1].url).toContain("/aud-1?fields=approximate_count_lower_bound");
    expect(tables.meta_custom_audiences[0]).toMatchObject({ dealership_id: "d1", audience_key: "abandoned_cart", sync_status: "synced", approximate_count: 1200 });
  });

  it("the customer list is created and uploaded with the user token too", async () => {
    seed("valid");
    expect((await post("buyers")).status).toBe(200);
    expect(calls.map((c) => c.url.includes("/users") ? "upload" : c.url.includes("customaudiences") ? "create" : "count")).toEqual(["create", "upload", "count"]);
    expect(calls.every((c) => c.token === USER)).toBe(true);
  });

  it("the page is ready only with a usable user token", async () => {
    seed("valid");
    const body = await (await GET()).json();
    expect(body).toMatchObject({ ready: true, missing: { connection: false }, connection: null });
  });
});

describe("no usable user token: say what to do, send nothing", () => {
  it("expired: 'reconnect' — and it does NOT fall back to the Page token", async () => {
    seed("expired");
    const body = await (await GET()).json();
    expect(body).toMatchObject({ ready: false, missing: { connection: true }, connection: { reason: "expired", message: AUDIENCE_TOKEN_EXPIRED } });
    const res = await post("abandoned_cart");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: AUDIENCE_TOKEN_EXPIRED, needsReconnect: true });
    expect(calls).toEqual([]);
    expect(tables.meta_custom_audiences).toEqual([]);
  });

  it("only a Page token (connected before the user token was kept): 'reconnect', nothing sent", async () => {
    seed("none");
    const body = await (await GET()).json();
    expect(body.connection).toEqual({ reason: "page_only", message: AUDIENCE_TOKEN_PAGE_ONLY });
    expect(body.ready).toBe(false);
    const res = await post("buyers");
    expect(await res.json()).toEqual({ error: AUDIENCE_TOKEN_PAGE_ONLY, needsReconnect: true });
    expect(calls).toEqual([]);
  });

  it("never connected: 'connect', not 'reconnect'", async () => {
    seed("none", false);
    const body = await (await GET()).json();
    expect(body.connection).toEqual({ reason: "missing", message: AUDIENCE_TOKEN_MISSING });
    expect(await (await post("abandoned_cart")).json()).toEqual({ error: AUDIENCE_TOKEN_MISSING, needsReconnect: false });
    expect(calls).toEqual([]);
  });

  it("the token is this business's own", async () => {
    seed("none", false);
    // The other business's row first: a lookup that isn't filtered would find its token.
    tables.dealerships.reverse();
    expect(await loadMetaAudienceToken(client(), "d1")).toMatchObject({ ok: false, reason: "missing" });
    expect(await loadMetaAudienceToken(client(), "d2")).toEqual({ ok: true, token: "other-business-token" });
  });
});

describe("Meta says the token is dead (190) before the stored expiry", () => {
  it("the owner is told to reconnect, and the row records it", async () => {
    seed("valid");
    meta(() => ({ status: 400, body: { error: { code: 190, error_subcode: 460, type: "OAuthException", message: "Error validating access token: The session has been invalidated because the user changed their password." } } }));
    const res = await post("viewed_no_purchase");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: AUDIENCE_TOKEN_EXPIRED, needsReconnect: true, needsTermsAcceptance: false });
    expect(calls).toHaveLength(1);
    expect(tables.meta_custom_audiences[0]).toMatchObject({ sync_status: "failed", sync_error: AUDIENCE_TOKEN_EXPIRED });
  });

  it("other Meta errors are not called a dead token", async () => {
    seed("valid");
    meta(() => ({ status: 400, body: { error: { code: 100, message: "Invalid parameter" } } }));
    expect(await (await post("abandoned_cart")).json()).toMatchObject({ error: "Invalid parameter", needsReconnect: false });
  });
});

describe("the panel", () => {
  it("says connect or reconnect, and links to the Facebook connection page", () => {
    const panel = readFileSync("src/components/retargeting/CustomAudiencesPanel.tsx", "utf8");
    expect(panel).toContain("setConnection(d.connection ?? null);");
    expect(panel).toContain('{connection?.reason === "missing" ? "Connect Facebook" : "Reconnect Facebook"}');
    expect(panel).toContain("setReconnect(!!d.needsReconnect);");
    expect(panel).toContain('href="/dashboard/settings/connect-facebook"');
  });
});
