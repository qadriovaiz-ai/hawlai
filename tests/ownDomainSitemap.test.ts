// A BUSINESS ON ITS OWN DOMAIN GETS ITS SITEMAP TO GOOGLE WITH NOBODY
// OPENING SEARCH CONSOLE — 27 November 2026, on the founder's sign-off.
//
// Shopify, WordPress and custom-domain businesses are not on
// hawlai.online, so the platform credential cannot reach them. Their own
// Search Console connection now asks for write access, and three moments
// submit their sitemap: a change published to their site, connecting
// Search Console, and every day.
//
// THE THING THAT WOULD HAVE MADE ALL OF IT DEAD ON ARRIVAL, found while
// building it: the connect callback matched properties against the
// Hawlai storefront URL only, so an own-domain business could never get
// a property selected at all. Section 5 pins the fix.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { code } from "./helpers/source";

const PROPERTY = "sc-domain:shop.example";
const OWNER_TOKEN = "owner-access";

// ---- the service client the queue writes through -----------------------

let queued: Record<string, any>[];
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, any>) => {
        if (table === "event_queue") queued.push(row);
        return { error: null };
      },
    }),
  }),
}));

// The daily runner's first half is not what this file is about.
vi.mock("@/lib/seo/searchQueries", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, syncSearchQueries: vi.fn(async () => ({ stored: 3, window: { from: "a", to: "b" } })) };
});

/** The business's stored connection, as the dispatcher's client reads it. */
function serviceWith(siteUrl: string | null, connected = true) {
  return {
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        update: () => api,
        maybeSingle: async () => {
          if (table !== "dealerships" || !connected) return { data: {}, error: null };
          return {
            data: {
              search_console_access_token: OWNER_TOKEN,
              search_console_refresh_token: "owner-refresh",
              search_console_token_expiry: new Date(Date.now() + 86_400_000).toISOString(),
              search_console_site_url: siteUrl,
              search_console_email: "owner@example.com",
            },
            error: null,
          };
        },
      };
      return api;
    },
  };
}

// ---- Google and the business's own site, faked at the network ---------

type Call = { url: string; method: string; auth: string | null };
let calls: Call[];
let existingSitemaps: string[];
let site: Record<string, { status?: number; body: string; finalUrl?: string }>;
let putReply: { status: number; message?: string };

const SITEMAPS_API = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/sitemaps`;

function respond(body: string, status: number, finalUrl?: string): Response {
  const res = new Response(body, { status });
  if (finalUrl) Object.defineProperty(res, "url", { value: finalUrl });
  return res;
}

beforeEach(() => {
  queued = [];
  calls = [];
  existingSitemaps = [];
  putReply = { status: 204 };
  site = {
    "https://shop.example/robots.txt": { body: "User-agent: *\nSitemap: https://shop.example/sitemap.xml\n" },
    "https://shop.example/sitemap.xml": { body: '<?xml version="1.0"?><sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>' },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      calls.push({ url, method, auth: init.headers?.Authorization ?? null });
      if (url === SITEMAPS_API && method === "GET") {
        return respond(JSON.stringify({ sitemap: existingSitemaps.map((path) => ({ path })) }), 200);
      }
      if (url.startsWith(`${SITEMAPS_API}/`) && method === "PUT") {
        return putReply.status < 300
          ? new Response(null, { status: putReply.status })
          : respond(JSON.stringify({ error: { message: putReply.message } }), putReply.status);
      }
      const page = site[url];
      if (page) return respond(page.body, page.status ?? 200, page.finalUrl);
      return respond("not found", 404);
    })
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

import { executePublishAction } from "@/lib/publish/executor";
import { EVENT_HANDLERS } from "@/lib/events/eventHandlers";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";
import { ensureOwnDomainSitemap, inProperty, SITE_PUBLISHED_EVENT, SEARCH_CONSOLE_CONNECTED_EVENT } from "@/lib/seo/sitemapSubmit";
import { matchFirstProperty } from "@/lib/seo/siteAddresses";

const puts = () => calls.filter((c) => c.method === "PUT");
const putFeed = (c: Call) => decodeURIComponent(c.url.slice(SITEMAPS_API.length + 1));

/** A publish action, approved, on the given platform. */
function executorDb(platform: string) {
  const row = {
    id: "act-1", dealership_id: "d1", platform, action_key: "update_page_text",
    target_ref: "page-1", target_label: "About", requested_changes: {}, preview: { summary: "", changes: [], warnings: [] },
    previewed_at: new Date().toISOString(), status: "approved", approval_id: "app-1", idempotency_key: "k1", updated_at: new Date().toISOString(),
  };
  const from = (table: string) => {
    const api: any = {
      _update: null,
      select: () => api, eq: () => api, or: () => api,
      insert: () => Promise.resolve({ data: null, error: null }),
      update: (f: any) => ((api._update = f), api),
      maybeSingle: async () => {
        if (api._update) return { data: { id: "act-1" } };
        if (table === "publish_actions") return { data: row };
        if (table === "pending_approvals") return { data: { id: "app-1", status: "approved" } };
        return { data: null };
      },
    };
    return api;
  };
  return { from };
}

const okPlatform = (id: string) => ({
  id, supports: ["update_page_text"], isConnected: async () => true,
  preview: async () => ({ ok: false, reason: "unused" }),
  execute: async () => ({ ok: true, platformResponse: {} }),
});

async function dispatch(service: any) {
  for (const row of queued) {
    for (const handler of EVENT_HANDLERS[row.event_type] ?? []) {
      await handler(service, { id: "e1", dealership_id: row.dealership_id, event_type: row.event_type, payload: row.payload });
    }
  }
}

describe("1. A CHANGE PUBLISHED TO THE BUSINESS'S OWN SITE SUBMITS ITS SITEMAP, with nobody touching Search Console", () => {
  it("THE WHOLE CHAIN: a Shopify publish -> queued event -> handler -> the sitemap PUT on the business's own property", async () => {
    const outcome = await executePublishAction(
      { supabase: executorDb("shopify"), platforms: { shopify: okPlatform("shopify") } as any, now: Date.now },
      "act-1"
    );
    expect(outcome.status).toBe("executed");
    expect(queued).toEqual([{ dealership_id: "d1", event_type: SITE_PUBLISHED_EVENT, payload: { scope: "own_domain" } }]);

    await dispatch(serviceWith(PROPERTY));
    expect(puts()).toHaveLength(1);
    expect(putFeed(puts()[0])).toBe("https://shop.example/sitemap.xml");
    // THE OWNER'S token, on THE OWNER'S property — never the platform's.
    expect(puts()[0].auth).toBe(`Bearer ${OWNER_TOKEN}`);
  });

  it("AND THE SAME FOR WORDPRESS", async () => {
    await executePublishAction({ supabase: executorDb("wordpress"), platforms: { wordpress: okPlatform("wordpress") } as any, now: Date.now }, "act-1");
    expect(queued.map((q) => q.payload)).toEqual([{ scope: "own_domain" }]);
  });

  it("A CHANGE TO A HAWLAI SITE QUEUES NOTHING HERE — the platform sitemap covers it", async () => {
    await executePublishAction({ supabase: executorDb("hawlai_site"), platforms: { hawlai_site: okPlatform("hawlai_site") } as any, now: Date.now }, "act-1");
    expect(queued).toEqual([]);
  });

  it("CONNECTING SEARCH CONSOLE SUBMITS TOO, through its own event", async () => {
    queued.push({ dealership_id: "d1", event_type: SEARCH_CONSOLE_CONNECTED_EVENT, payload: { scope: "own_domain" } });
    await dispatch(serviceWith(PROPERTY));
    expect(puts()).toHaveLength(1);
  });

  it("AND NEVER THE INDEXING API", async () => {
    queued.push({ dealership_id: "d1", event_type: SITE_PUBLISHED_EVENT, payload: { scope: "own_domain" } });
    await dispatch(serviceWith(PROPERTY));
    expect(calls.some((c) => c.url.includes("indexing.googleapis.com"))).toBe(false);
  });
});

describe("2. THE SITEMAP IS FOUND BY LOOKING, NEVER BY GUESSING", () => {
  it("SITEMAPS ALREADY SUBMITTED ARE RESUBMITTED, and nothing is added beside them", async () => {
    existingSitemaps = ["https://shop.example/custom-map.xml"];
    const r = await ensureOwnDomainSitemap(serviceWith(PROPERTY), "d1");
    expect(r).toEqual({ submitted: ["https://shop.example/custom-map.xml"], property: PROPERTY });
    expect(calls.some((c) => c.url.endsWith("/robots.txt"))).toBe(false);
  });

  it("ROBOTS.TXT IS ASKED FIRST — it is the site's own declaration", async () => {
    site["https://shop.example/robots.txt"].body = "Sitemap: https://shop.example/declared.xml";
    site["https://shop.example/declared.xml"] = { body: "<urlset></urlset>" };
    const r = await ensureOwnDomainSitemap(serviceWith(PROPERTY), "d1");
    expect(r).toEqual({ submitted: ["https://shop.example/declared.xml"], property: PROPERTY });
  });

  it("A SITEMAP ON ANOTHER DOMAIN IS IGNORED — Google refuses one from outside the property", async () => {
    site["https://shop.example/robots.txt"].body = "Sitemap: https://cdn.elsewhere.example/map.xml";
    site["https://cdn.elsewhere.example/map.xml"] = { body: "<urlset></urlset>" };
    const r: any = await ensureOwnDomainSitemap(serviceWith(PROPERTY), "d1");
    expect(r.submitted).toEqual(["https://shop.example/sitemap.xml"]);
    // NOT EVEN FETCHED. robots.txt is text anyone can write, and Hawlai's
    // server has no business requesting an address outside the property
    // it was asked about. (A first version of this test checked only the
    // outcome, and a mutation that removed this filter survived it.)
    expect(calls.some((c) => c.url.includes("cdn.elsewhere.example"))).toBe(false);
  });

  it("WORDPRESS'S REDIRECT IS FOLLOWED, and Google gets the address it ended at", async () => {
    site["https://shop.example/robots.txt"] = { body: "User-agent: *" };
    site["https://shop.example/sitemap.xml"] = { body: "<sitemapindex></sitemapindex>", finalUrl: "https://shop.example/wp-sitemap.xml" };
    const r: any = await ensureOwnDomainSitemap(serviceWith(PROPERTY), "d1");
    expect(r.submitted).toEqual(["https://shop.example/wp-sitemap.xml"]);
  });

  it("A PAGE THAT ANSWERS 200 BUT IS NOT A SITEMAP DOES NOT COUNT — and finding none is an error that says where it looked", async () => {
    site["https://shop.example/robots.txt"] = { body: "User-agent: *" };
    site["https://shop.example/sitemap.xml"] = { body: "<html><body>Our shop</body></html>" };
    const r: any = await ensureOwnDomainSitemap(serviceWith(PROPERTY), "d1");
    expect(r.error).toMatch(/no sitemap was found.*robots\.txt.*\/sitemap\.xml/);
    expect(puts()).toEqual([]);
  });

  it("the property check, both kinds", () => {
    expect(inProperty("https://www.shop.example/a.xml", "sc-domain:shop.example")).toBe(true);
    expect(inProperty("https://shop.example.evil/a.xml", "sc-domain:shop.example")).toBe(false);
    expect(inProperty("https://shop.example/blog/map.xml", "https://shop.example/blog/")).toBe(true);
    expect(inProperty("https://shop.example/map.xml", "https://shop.example/blog/")).toBe(false);
  });
});

describe("3. WHEN IT CANNOT HAPPEN, IT SAYS WHY — and what fixes it", () => {
  it("AN OLD READ-ONLY TOKEN SAYS ONE RECONNECT FIXES IT", async () => {
    putReply = { status: 403, message: "Request had insufficient authentication scopes." };
    const r: any = await ensureOwnDomainSitemap(serviceWith(PROPERTY), "d1");
    expect(r.error).toMatch(/read-only access; reconnecting Search Console once/);
  });

  it("A RESTRICTED USER ON THE PROPERTY IS TOLD IT NEEDS OWNER OR FULL — a reconnect would not help", async () => {
    putReply = { status: 403, message: "User does not have sufficient permission for site." };
    const r: any = await ensureOwnDomainSitemap(serviceWith(PROPERTY), "d1");
    expect(r.error).toMatch(/needs Owner or Full access/);
    expect(r.error).not.toMatch(/reconnect/);
  });

  it("A FAILED SUBMISSION FAILS THE EVENT", async () => {
    putReply = { status: 500, message: "backend error" };
    queued.push({ dealership_id: "d1", event_type: SITE_PUBLISHED_EVENT, payload: { scope: "own_domain" } });
    await expect(dispatch(serviceWith(PROPERTY))).rejects.toThrow(/refused the sitemap \(500\)/);
  });
});

describe("4. THE SKIPS THAT ARE NOT FAILURES", () => {
  it("THE PLATFORM'S OWN PROPERTY IS LEFT TO THE PLATFORM CREDENTIAL, and Google is not called", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://hawlai.online";
    const r = await ensureOwnDomainSitemap(serviceWith("sc-domain:hawlai.online"), "d1");
    expect(r).toEqual({ skipped: expect.stringContaining("platform") });
    expect(calls).toEqual([]);
  });

  it("NOT CONNECTED, AND NO PROPERTY, ARE SKIPS", async () => {
    expect(await ensureOwnDomainSitemap(serviceWith(null, false), "d1")).toEqual({ skipped: expect.stringContaining("isn't connected") });
    expect(await ensureOwnDomainSitemap(serviceWith(null), "d1")).toEqual({ skipped: expect.stringContaining("no Search Console property") });
  });

  it("AND A SKIPPED EVENT DOES NOT FAIL", async () => {
    queued.push({ dealership_id: "d1", event_type: SITE_PUBLISHED_EVENT, payload: { scope: "own_domain" } });
    await expect(dispatch(serviceWith(null, false))).resolves.toBeUndefined();
  });
});

describe("5. EVERY DAY, AND THE PROPERTY CAN ACTUALLY BE FOUND", () => {
  it("THE DAILY SEARCH SYNC SUBMITS THE BUSINESS'S OWN SITEMAP TOO", async () => {
    const r: any = await DAILY_RUNNERS.search_console_sync(serviceWith(PROPERTY), "d1", "any");
    expect(r.stored).toBe(3);
    expect(r.sitemap).toEqual({ submitted: ["https://shop.example/sitemap.xml"], property: PROPERTY });
    expect(r.error).toBeUndefined();
  });

  it("A FAILED SITEMAP TURNS THE RUN RED, and says which half failed", async () => {
    putReply = { status: 500, message: "backend error" };
    const r: any = await DAILY_RUNNERS.search_console_sync(serviceWith(PROPERTY), "d1", "any");
    expect(r.error).toMatch(/^sitemap: Search Console refused the sitemap \(500\)/);
  });

  // THE CALLBACK'S WIRING, read with comments stripped (Rule 8) and each
  // slice bounded at BOTH ends. A behavioural test of the callback would
  // need Google's whole OAuth exchange faked; the two facts that matter
  // are which addresses it matches and that it queues, and both are here.
  it("THE CONNECT CALLBACK MATCHES EVERY ADDRESS THE BUSINESS IS KNOWN BY", () => {
    const src = code("src/app/api/auth/search-console/callback/route.ts");
    const start = src.indexOf("const sites = await listSites(");
    const end = src.indexOf("} catch", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).toMatch(/matchFirstProperty\(\s*sites\s*,\s*await\s+businessSiteAddresses\(/);
  });

  it("AND QUEUES A SUBMISSION WHEN THE PROPERTY IS THE BUSINESS'S OWN", () => {
    const src = code("src/app/api/auth/search-console/callback/route.ts");
    const start = src.indexOf('.eq("id", dealershipId);');
    const end = src.indexOf("search_console=connected", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const between = src.slice(start, end);
    expect(between).toMatch(/if\s*\(\s*siteUrl\s*&&\s*!isPlatformProperty\(siteUrl\)\s*\)/);
    expect(between).toMatch(/queueSitemapSubmission\(\s*dealershipId\s*,\s*"own_domain"\s*,\s*SEARCH_CONSOLE_CONNECTED_EVENT\s*\)/);
  });

  it("AN OWN-DOMAIN BUSINESS'S PROPERTY IS MATCHED — not only the Hawlai storefront", () => {
    const sites = [
      { siteUrl: "sc-domain:someone-else.example", permissionLevel: "siteOwner" },
      { siteUrl: PROPERTY, permissionLevel: "siteOwner" },
    ];
    // A Shopify merchant with no Hawlai storefront: the storefront address
    // is absent, the shop's own domain is there.
    expect(matchFirstProperty(sites, ["https://www.shop.example", "https://shop-1.myshopify.com"])).toBe(PROPERTY);
    // And nothing is matched by default: no address, no property.
    expect(matchFirstProperty(sites, [])).toBeNull();
  });
});
