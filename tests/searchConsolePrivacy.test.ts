// One business must never read another's searches.
//
// Every storefront lives at hawlai.online/site/{slug}, and the connected
// property is sc-domain:hawlai.online — the whole domain. A read with no
// page filter returns every shop's queries at once, plus Hawlai's own
// marketing pages, and writes them all under whichever business happened
// to run the sync. Only candle_by_qaaf exists today, so nothing has
// leaked; this is the check that keeps it that way when the second
// business signs up.
//
// The filter is applied BY GOOGLE, in the request. Filtering a
// domain-wide response afterwards would mean the other businesses'
// figures had already crossed the wire.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchQueries, sitePageFilter, isPlatformProperty } from "@/lib/seo/searchConsole";
import { syncSearchQueries } from "@/lib/seo/searchQueries";

afterEach(() => vi.unstubAllGlobals());

const HOST = "hawlai.online";

/** URLs Google would report for a domain property covering all of Hawlai. */
const DOMAIN_WIDE = [
  "https://hawlai.online/site/candle-by-qaaf",
  "https://hawlai.online/site/candle-by-qaaf/shop",
  "https://hawlai.online/site/candle-by-qaaf/products/p1?ref=wa",
  "https://hawlai.online/site/candle-by-qaaf/about#story",
  "https://hawlai.online/site/candle",
  "https://hawlai.online/site/candle/shop",
  "https://hawlai.online/site/candle-by-qaaf-2",
  "https://hawlai.online/",
  "https://hawlai.online/p/summer-offer",
  "https://hawlai.online/dashboard",
];

const matches = (pattern: string, url: string) => new RegExp(pattern).test(url);

describe("the page filter, as a pattern", () => {
  it("takes the whole of one shop and nothing else", () => {
    const filter = sitePageFilter("candle-by-qaaf", HOST);
    const seen = DOMAIN_WIDE.filter((u) => matches(filter, u));
    expect(seen).toEqual([
      "https://hawlai.online/site/candle-by-qaaf",
      "https://hawlai.online/site/candle-by-qaaf/shop",
      "https://hawlai.online/site/candle-by-qaaf/products/p1?ref=wa",
      "https://hawlai.online/site/candle-by-qaaf/about#story",
    ]);
  });

  it("A SLUG THAT IS A PREFIX OF ANOTHER reads only its own pages", () => {
    // The case that makes `contains` unusable: /site/candle is a
    // substring of /site/candle-by-qaaf.
    const filter = sitePageFilter("candle", HOST);
    expect(DOMAIN_WIDE.filter((u) => matches(filter, u))).toEqual([
      "https://hawlai.online/site/candle",
      "https://hawlai.online/site/candle/shop",
    ]);
  });

  it("neither business ever sees Hawlai's own pages", () => {
    for (const slug of ["candle", "candle-by-qaaf"]) {
      const filter = sitePageFilter(slug, HOST);
      expect(matches(filter, "https://hawlai.online/")).toBe(false);
      expect(matches(filter, "https://hawlai.online/p/summer-offer")).toBe(false);
      expect(matches(filter, "https://hawlai.online/dashboard")).toBe(false);
    }
  });

  it("keeps the homepage, which has no trailing slash", () => {
    // `contains "/site/candle-by-qaaf/"` would lose exactly this row —
    // usually the business's best one.
    expect(matches(sitePageFilter("candle-by-qaaf", HOST), "https://hawlai.online/site/candle-by-qaaf")).toBe(true);
    expect(matches(sitePageFilter("candle-by-qaaf", HOST), "https://hawlai.online/site/candle-by-qaaf/")).toBe(true);
  });

  it("treats a dot in a slug as a dot", () => {
    // Unescaped, "." matches any character, so a slug like "a.b" would
    // also match "axb".
    const filter = sitePageFilter("a.b", HOST);
    expect(matches(filter, "https://hawlai.online/site/a.b")).toBe(true);
    expect(matches(filter, "https://hawlai.online/site/axb")).toBe(false);
  });
});

describe("which properties get filtered", () => {
  it("the platform's own domain does", () => {
    expect(isPlatformProperty("sc-domain:hawlai.online")).toBe(true);
    expect(isPlatformProperty("https://hawlai.online/")).toBe(true);
    expect(isPlatformProperty("https://www.hawlai.online/")).toBe(true);
  });

  it("a business's OWN domain does not — filtering it would return nothing", () => {
    expect(isPlatformProperty("sc-domain:candlebyqaaf.com")).toBe(false);
    expect(isPlatformProperty("https://candlebyqaaf.com/")).toBe(false);
  });
});

describe("the request that actually goes to Google", () => {
  function googleReturns(rows: { page: string; query: string }[]) {
    const sent: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        sent.push(body);
        // Google applies the filter: only matching pages come back.
        const filter = body.dimensionFilterGroups?.[0]?.filters?.[0]?.expression;
        const visible = filter ? rows.filter((r) => matches(filter, r.page)) : rows;
        return new Response(
          JSON.stringify({ rows: visible.map((r) => ({ keys: [r.query], clicks: 1, impressions: 10, ctr: 0.1, position: 5 })) }),
          { status: 200 }
        );
      })
    );
    return sent;
  }

  const WORLD = [
    { page: "https://hawlai.online/site/candle-by-qaaf", query: "candle by qaaf" },
    { page: "https://hawlai.online/site/candle-by-qaaf/shop", query: "soy candles shahjahanpur" },
    { page: "https://hawlai.online/site/candle", query: "candle shop" },
    { page: "https://hawlai.online/p/summer-offer", query: "hawlai offer" },
  ];

  it("sends the filter in the body, on the page dimension", async () => {
    const sent = googleReturns(WORLD);
    await fetchQueries("tok", "sc-domain:hawlai.online", { from: "a", to: "b" }, sitePageFilter("candle-by-qaaf", HOST));
    expect(sent[0].dimensionFilterGroups).toEqual([
      { filters: [{ dimension: "page", operator: "includingRegex", expression: sitePageFilter("candle-by-qaaf", HOST) }] },
    ]);
  });

  it("EACH BUSINESS RECEIVES ONLY ITS OWN QUERIES", async () => {
    googleReturns(WORLD);
    const qaaf = await fetchQueries("tok", "sc-domain:hawlai.online", { from: "a", to: "b" }, sitePageFilter("candle-by-qaaf", HOST));
    expect(qaaf.map((r) => r.query)).toEqual(["candle by qaaf", "soy candles shahjahanpur"]);

    googleReturns(WORLD);
    const candle = await fetchQueries("tok", "sc-domain:hawlai.online", { from: "a", to: "b" }, sitePageFilter("candle", HOST));
    expect(candle.map((r) => r.query)).toEqual(["candle shop"]);
    // Not the other shop's, and not Hawlai's own.
    expect(candle.map((r) => r.query)).not.toContain("soy candles shahjahanpur");
    expect(candle.map((r) => r.query)).not.toContain("hawlai offer");
  });
});

describe("the sync fails closed", () => {
  function db(opts: { connected?: boolean; slug?: string | null }) {
    const stored: any[] = [];
    return {
      stored,
      from(table: string) {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data:
              table === "dealerships"
                ? opts.connected === false
                  ? {}
                  : {
                      search_console_refresh_token: "r",
                      search_console_access_token: "a",
                      search_console_token_expiry: new Date(Date.now() + 3_600_000).toISOString(),
                      search_console_site_url: "sc-domain:hawlai.online",
                    }
                : { slug: opts.slug ?? null },
          }),
          upsert: async (rows: any[]) => {
            stored.push(...rows);
            return { error: null };
          },
          insert: async () => ({ error: null }),
        };
        return chain;
      },
    };
  }

  it("READS NOTHING when the business has no website to scope to", async () => {
    const called = vi.fn();
    vi.stubGlobal("fetch", called);
    const result = await syncSearchQueries(db({ slug: null }) as any, "d1");
    expect(result.stored).toBe(0);
    expect(result.skipped).toMatch(/no Hawlai website yet/);
    // The important half: no request was made at all. A missing slug
    // must never quietly mean "read the whole domain".
    expect(called).not.toHaveBeenCalled();
  });

  it("scopes the read, and records what it was scoped to", async () => {
    const store = db({ slug: "candle-by-qaaf" });
    const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ rows: [{ keys: ["soy candles"], clicks: 1, impressions: 20, ctr: 0.05, position: 6 }] }), { status: 200 });
    }));

    const result = await syncSearchQueries(store as any, "d1");
    expect(result.stored).toBe(1);
    expect(sent[0].dimensionFilterGroups[0].filters[0].expression).toContain("candle-by-qaaf");
    // Stored on the row, so an un-scoped row is detectable later.
    expect(store.stored[0].page_filter).toBe(sitePageFilter("candle-by-qaaf"));
  });
});

describe("what the rest of the product can read", () => {
  function stored(rows: any[]) {
    const filters: any[] = [];
    return {
      filters,
      from() {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          not: (column: string, op: string, value: any) => {
            filters.push([column, op, value]);
            return chain;
          },
          order: () => chain,
          limit: async () => ({ data: rows.filter((r) => filters.some(([c]) => c === "page_filter") ? r.page_filter != null : true) }),
        };
        return chain;
      },
    };
  }

  it("HIDES rows written before scoping existed, whatever asks for them", async () => {
    const { topQueries } = await import("@/lib/seo/searchQueries");
    const db = stored([
      { query: "domain-wide leftover", clicks: 9, impressions: 99, ctr: 0.1, position: 2, window_to: "2026-09-26", page_filter: null },
      { query: "soy candles", clicks: 1, impressions: 20, ctr: 0.05, position: 6, window_to: "2026-09-26", page_filter: sitePageFilter("candle-by-qaaf") },
    ]);
    const rows = await topQueries(db as any, "d1");
    expect(rows.map((r) => r.query)).toEqual(["soy candles"]);
    // Asked of the database, not filtered in memory afterwards.
    expect(db.filters).toContainEqual(["page_filter", "is", null]);
  });

  it("is the one door the SEO toolkit, opportunities and strategy all come through", () => {
    // If any of them read search_queries directly they would bypass the
    // check above, so this fails if a second door is ever opened.
    const { readFileSync, readdirSync } = require("fs") as typeof import("fs");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && path !== "src/lib/seo/searchQueries.ts") {
          if (readFileSync(path, "utf8").includes('from("search_queries")')) offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
