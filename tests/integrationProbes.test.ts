// LIVE CHECKS FOR THE THREE WHERE "CONNECTED" WAS ALREADY CAUGHT LYING —
// 27 November 2026, H2 of docs/AUDIT-INTEGRATION-HEALTH.md.
//
// Search Console said Connected on a token dead for 23 days. Instagram said
// connected while its token was invalidated (401, code 190) and its webhook
// had never been subscribed — zero DMs ever reached Hawlai. Each check here
// asks two questions, because both failures were real: does the credential
// work, and is the connection set up to do its job.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code } from "./helpers/source";

const SECRET = "SECRET-TOKEN-must-never-appear";
const IG_ID = "17841400000000000";
const PAGE_ID = "1029384756";
const APP_ID = "app-hawlai";

// ---- a service client with one business row --------------------------
let row: Record<string, any>;
let healthWrites: any[];
let dealershipUpdates: { values: any; isNull?: string }[];

function service() {
  return {
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        is: (col: string) => {
          dealershipUpdates[dealershipUpdates.length - 1].isNull = col;
          return api;
        },
        maybeSingle: async () => ({ data: table === "dealerships" ? row : null, error: null }),
        upsert: async (r: any) => {
          healthWrites.push(r);
          return { error: null };
        },
        update: (values: any) => {
          dealershipUpdates.push({ values });
          return api;
        },
        then: (res: any, rej: any) => Promise.resolve({ error: null }).then(res, rej),
      };
      return api;
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => service() }));
vi.mock("@/lib/notifications/emit", () => ({ emitNotification: async () => {} }));

// ---- Meta and Google, faked at the network ----------------------------
type Reply = { status?: number; body: any } | "timeout";
let replies: Record<string, Reply>;
let called: string[];

function reply(url: string): Reply {
  const key = Object.keys(replies).find((k) => url.includes(k));
  return key ? replies[key] : { status: 404, body: { error: { message: "unrouted " + url.split("?")[0] } } };
}

beforeEach(() => {
  row = {};
  healthWrites = [];
  dealershipUpdates = [];
  called = [];
  replies = {};
  process.env.FACEBOOK_APP_ID = APP_ID;
  process.env.NEXT_PUBLIC_SITE_URL = "https://hawlai.online";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = String(input);
      called.push(url);
      const r = reply(url);
      if (r === "timeout") {
        const e = new Error("The operation was aborted due to timeout");
        e.name = "TimeoutError";
        throw e;
      }
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

import { probeInstagram, probeMetaPage, probeSearchConsole, runProbe, probeAndRecord, refreshStaleProbes, PROBES, FRESH_FOR_MS } from "@/lib/integrations/probes";
import { INTEGRATIONS } from "@/lib/integrations/registry";

const DEAD = { status: 401, body: { error: { type: "OAuthException", code: 190, message: "Error validating access token: The session has been invalidated because the user changed their password" } } };

// ---------------------------------------------------------------------
describe("1. INSTAGRAM — the token, and whether DMs can arrive at all", () => {
  beforeEach(() => {
    row = { instagram_business_id: IG_ID, instagram_access_token: SECRET };
  });

  it("THE PRODUCTION CASE: AN INVALIDATED TOKEN IS 'NEEDS RECONNECT', with Meta's own words", async () => {
    replies["graph.instagram.com/v26.0/me?"] = DEAD;
    const r = await probeInstagram(service(), "d1");
    expect(r.state).toBe("needs_reconnect");
    expect(r.reason).toMatch(/OAuthException: code 190: .*session has been invalidated/);
  });

  it("A WORKING TOKEN WITH NO WEBHOOK IS 'INCOMPLETE' — DMs never arrive", async () => {
    replies["graph.instagram.com/v26.0/me?"] = { body: { user_id: IG_ID } };
    replies[`/${IG_ID}/subscribed_apps`] = { body: { data: [] } };
    const r = await probeInstagram(service(), "d1");
    expect(r.state).toBe("incomplete");
    expect(r.reason).toMatch(/never set up to send messages/);
    expect(r.subscribed).toEqual({ ok: false, error: expect.any(String) });
  });

  it("SUBSCRIBED TO COMMENTS BUT NOT MESSAGES IS STILL INCOMPLETE, and says which", async () => {
    replies["graph.instagram.com/v26.0/me?"] = { body: { user_id: IG_ID } };
    replies[`/${IG_ID}/subscribed_apps`] = { body: { data: [{ subscribed_fields: ["comments"] }] } };
    const r = await probeInstagram(service(), "d1");
    expect(r.state).toBe("incomplete");
    expect(r.reason).toContain("not sending messages");
  });

  it("A WORKING TOKEN SUBSCRIBED TO MESSAGES AND COMMENTS IS WORKING", async () => {
    replies["graph.instagram.com/v26.0/me?"] = { body: { user_id: IG_ID } };
    replies[`/${IG_ID}/subscribed_apps`] = { body: { data: [{ subscribed_fields: ["messages", "comments"] }] } };
    expect(await probeInstagram(service(), "d1")).toEqual({ state: "working", reason: null, subscribed: { ok: true, error: null } });
  });

  it("IT READS THE SAME /{id}/subscribed_apps EDGE THE CONNECT CALLBACK WRITES TO", async () => {
    replies["graph.instagram.com/v26.0/me?"] = { body: { user_id: IG_ID } };
    replies[`/${IG_ID}/subscribed_apps`] = { body: { data: [] } };
    await probeInstagram(service(), "d1");
    expect(called.some((u) => u.includes(`graph.instagram.com/v26.0/${IG_ID}/subscribed_apps`))).toBe(true);
  });

  it("NO STORED TOKEN IS 'NEEDS RECONNECT' without calling anyone", async () => {
    row = { instagram_business_id: IG_ID, instagram_access_token: null };
    expect((await probeInstagram(service(), "d1")).state).toBe("needs_reconnect");
    expect(called).toEqual([]);
  });

  it("A META THAT DOES NOT ANSWER IS 'NOT RESPONDING' — not 'reconnect'", async () => {
    replies["graph.instagram.com/v26.0/me?"] = "timeout";
    const r = await probeInstagram(service(), "d1");
    expect(r.state).toBe("not_responding");
    expect(r.reason).toMatch(/no answer within/);
  });
});

// ---------------------------------------------------------------------
describe("2. THE FACEBOOK PAGE — and only Hawlai's own subscription counts", () => {
  beforeEach(() => {
    row = { fb_page_id: PAGE_ID, fb_page_access_token: SECRET };
  });
  const pageOk = () => (replies[`graph.facebook.com/v19.0/${PAGE_ID}?fields=id`] = { body: { id: PAGE_ID } });

  it("A DEAD PAGE TOKEN IS 'NEEDS RECONNECT'", async () => {
    replies[`graph.facebook.com/v19.0/${PAGE_ID}?fields=id`] = DEAD;
    expect((await probeMetaPage(service(), "d1")).state).toBe("needs_reconnect");
  });

  it("A PAGE SUBSCRIBED ONLY TO SOMEONE ELSE'S APP SENDS HAWLAI NOTHING — incomplete", async () => {
    pageOk();
    replies[`/${PAGE_ID}/subscribed_apps`] = { body: { data: [{ id: "another-app", subscribed_fields: ["messages", "feed"] }] } };
    const r = await probeMetaPage(service(), "d1");
    expect(r.state).toBe("incomplete");
    expect(r.subscribed?.ok).toBe(false);
  });

  it("HAWLAI'S APP WITH MESSAGES AND FEED IS WORKING", async () => {
    pageOk();
    replies[`/${PAGE_ID}/subscribed_apps`] = { body: { data: [{ id: APP_ID, subscribed_fields: [{ name: "messages" }, { name: "feed" }] }] } };
    expect((await probeMetaPage(service(), "d1")).state).toBe("working");
  });

  it("HAWLAI'S APP WITHOUT FEED IS INCOMPLETE — comment replies would never arrive", async () => {
    pageOk();
    replies[`/${PAGE_ID}/subscribed_apps`] = { body: { data: [{ id: APP_ID, subscribed_fields: ["messages"] }] } };
    const r = await probeMetaPage(service(), "d1");
    expect(r.state).toBe("incomplete");
    expect(r.reason).toContain("feed");
  });
});

// ---------------------------------------------------------------------
describe("3. SEARCH CONSOLE — the grant, the property, and write access where it matters", () => {
  const conn = (siteUrl: string | null, expiresInMs: number) => ({
    search_console_access_token: SECRET,
    search_console_refresh_token: "refresh-" + SECRET,
    search_console_token_expiry: new Date(Date.now() + expiresInMs).toISOString(),
    search_console_site_url: siteUrl,
    search_console_email: "owner@example.com",
  });
  const sites = (list: string[]) =>
    (replies["webmasters/v3/sites"] = { body: { siteEntry: list.map((siteUrl) => ({ siteUrl, permissionLevel: "siteOwner" })) } });

  it("THE 4 NOVEMBER FAILURE: A DEAD GRANT IS 'NEEDS RECONNECT'", async () => {
    row = conn("sc-domain:shop.example", -60_000);
    replies["oauth2.googleapis.com/token"] = { status: 400, body: { error: "invalid_grant", error_description: "Bad Request" } };
    const r = await probeSearchConsole(service(), "d1");
    expect(r.state).toBe("needs_reconnect");
    expect(r.reason).toContain("invalid_grant");
  });

  it("A PROPERTY THE ACCOUNT CAN NO LONGER SEE IS 'INCOMPLETE' — every read would come back empty", async () => {
    row = conn("sc-domain:shop.example", 3_600_000);
    sites(["sc-domain:other.example"]);
    const r = await probeSearchConsole(service(), "d1");
    expect(r.state).toBe("incomplete");
    expect(r.reason).toMatch(/can no longer see sc-domain:shop\.example/);
  });

  it("NO PROPERTY SELECTED IS 'INCOMPLETE'", async () => {
    row = conn(null, 3_600_000);
    sites(["sc-domain:shop.example"]);
    expect((await probeSearchConsole(service(), "d1")).state).toBe("incomplete");
  });

  it("ITS OWN DOMAIN, CONNECTED READ-ONLY, IS 'INCOMPLETE' — the sitemap can't be submitted", async () => {
    row = conn("sc-domain:shop.example", 3_600_000);
    sites(["sc-domain:shop.example"]);
    replies["oauth2.googleapis.com/tokeninfo"] = { body: { scope: "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email" } };
    const r = await probeSearchConsole(service(), "d1");
    expect(r.state).toBe("incomplete");
    expect(r.reason).toMatch(/read-only access/);
  });

  it("ITS OWN DOMAIN WITH WRITE ACCESS IS WORKING", async () => {
    row = conn("sc-domain:shop.example", 3_600_000);
    sites(["sc-domain:shop.example"]);
    replies["oauth2.googleapis.com/tokeninfo"] = { body: { scope: "https://www.googleapis.com/auth/webmasters https://www.googleapis.com/auth/userinfo.email" } };
    expect((await probeSearchConsole(service(), "d1")).state).toBe("working");
  });

  it("THE PLATFORM'S PROPERTY NEEDS NO WRITE ACCESS — the platform submits that sitemap", async () => {
    row = conn("sc-domain:hawlai.online", 3_600_000);
    sites(["sc-domain:hawlai.online"]);
    expect((await probeSearchConsole(service(), "d1")).state).toBe("working");
    expect(called.some((u) => u.includes("tokeninfo"))).toBe(false);
  });
});

// ---------------------------------------------------------------------
describe("4. RUNNING THEM", () => {
  it("NO REASON EVER CARRIES THE TOKEN", async () => {
    row = { instagram_business_id: IG_ID, instagram_access_token: SECRET, fb_page_id: PAGE_ID, fb_page_access_token: SECRET };
    replies["graph.instagram.com/v26.0/me?"] = { status: 401, body: { error: { message: `bad token ${SECRET.slice(0, 3)}` } } };
    replies[`graph.facebook.com/v19.0/${PAGE_ID}?fields=id`] = DEAD;
    for (const key of ["instagram", "meta_page"]) {
      const r = await runProbe(service(), "d1", key);
      expect(String(r.reason)).not.toContain(SECRET);
    }
  });

  it("A PROBE THAT THROWS IS 'NOT RESPONDING', never an exception into the page", async () => {
    const exploding = { from: () => { throw new Error("boom"); } };
    expect(await runProbe(exploding, "d1", "instagram")).toEqual({ state: "not_responding", reason: "the check itself failed: boom" });
  });

  it("A CHECK THAT FINDS NO WEBHOOK SAYS SO IN THE CONNECTION'S OWN RECORD — so the screen agrees", async () => {
    row = { instagram_business_id: IG_ID, instagram_access_token: SECRET };
    replies["graph.instagram.com/v26.0/me?"] = { body: { user_id: IG_ID } };
    replies[`/${IG_ID}/subscribed_apps`] = { body: { data: [] } };
    await probeAndRecord(service(), "d1", "instagram");
    expect(healthWrites[0]).toMatchObject({ integration: "instagram", state: "incomplete" });
    expect(dealershipUpdates[0].values).toMatchObject({ ig_webhook_subscribed_at: null, ig_webhook_error: expect.stringContaining("not subscribed") });
  });

  it("AND ONE THAT FINDS IT DATES IT — only if it was not dated already", async () => {
    row = { instagram_business_id: IG_ID, instagram_access_token: SECRET };
    replies["graph.instagram.com/v26.0/me?"] = { body: { user_id: IG_ID } };
    replies[`/${IG_ID}/subscribed_apps`] = { body: { data: [{ subscribed_fields: ["messages", "comments"] }] } };
    await probeAndRecord(service(), "d1", "instagram");
    expect(dealershipUpdates[0].values).toMatchObject({ ig_webhook_error: null, ig_webhook_subscribed_at: expect.any(String) });
    expect(dealershipUpdates[0].isNull).toBe("ig_webhook_subscribed_at");
  });

  it("ONLY STALE, CHECKABLE INTEGRATIONS ARE ASKED — a fresh answer is trusted for ten minutes", async () => {
    const now = new Date("2026-11-27T12:00:00Z");
    row = { instagram_business_id: IG_ID, instagram_access_token: SECRET };
    replies["graph.instagram.com/v26.0/me?"] = DEAD;
    const fresh = new Date(now.getTime() - FRESH_FOR_MS / 2).toISOString();
    const stale = new Date(now.getTime() - FRESH_FOR_MS * 2).toISOString();
    const ran = await refreshStaleProbes("d1", ["instagram", "meta_page", "gmail"], new Map([["instagram", stale], ["meta_page", fresh]]), now);
    // gmail has no probe; meta_page is fresh.
    expect(ran).toEqual(["instagram"]);
  });

  it("THE REGISTRY AND THE PROBES AGREE — every live-checked entry has a probe, except the two whose routes check them", () => {
    const routeChecked = new Set(["shopify", "woocommerce"]);
    const probed = INTEGRATIONS.filter((i) => i.probe && !routeChecked.has(i.key)).map((i) => i.key).sort();
    expect(Object.keys(PROBES).sort()).toEqual(probed);
    expect(probed).toEqual(["instagram", "meta_page", "search_console"]);
  });
});

// ---------------------------------------------------------------------
// The wiring, read with comments stripped and each slice bounded at both
// ends (Rule 8).
describe("5. EVERY REAL USE IS EVIDENCE, AND THE PAGE ASKS WHEN IT OPENS", () => {
  it("A DM SEND RECORDS WHAT IT FOUND — and only the send, not the writing of the reply", () => {
    const src = code("src/lib/webhooks/autoReplyHandler.ts");
    const start = src.indexOf('const connection = channel === "instagram" ? "instagram" : "meta_page";');
    // Bounded by the rethrow that closes THIS block. The first "} else {"
    // after the start is the instagram-or-page branch inside it — a first
    // version of this test ended there and sliced away the very lines it
    // was looking for.
    const end = src.indexOf("throw sendErr;", start) + "throw sendErr;".length;
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toMatch(/await recordHealth\(supabase, dealership\.id, connection, \{ state: "working", reason: null \}\)/);
    expect(block).toMatch(/await recordHealth\(supabase, dealership\.id, connection, healthFromFailure\(sendErr\?\.message\)\)/);
    expect(block).toMatch(/throw sendErr;/);
  });

  it("THE SEARCH SYNC RECORDS — WITHOUT A SECOND NOTIFICATION beside tellOwnerItDied", () => {
    const src = code("src/lib/seo/searchQueries.ts");
    const start = src.indexOf("export async function syncSearchQueries");
    const end = src.indexOf("export async function topQueries", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fn = src.slice(start, end);
    const records = fn.match(/recordHealth\(service, dealershipId, "search_console", [^;]+;/g) ?? [];
    expect(records).toHaveLength(3);
    for (const r of records) expect(r).toContain("{ notify: false }");
    expect(fn).toMatch(/recordHealth\(service, dealershipId, "search_console", \{ state: "working", reason: null \}/);
  });

  it("THE PAGE ASKS STALE CHECKS, THEN RE-READS BOTH THE STATES AND THE ROW", () => {
    const src = code("src/app/dashboard/settings/integrations/page.tsx");
    const start = src.indexOf("const probed = await refreshStaleProbes(");
    const end = src.indexOf("const shown = ", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toMatch(/if \(probed\.length\) \{\s*dealership = await readRow\(\);\s*stored = await readHealth\(supabase, dealershipId\);/);
  });
});
