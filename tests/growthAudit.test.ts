// S4/P1 — THE AUDIT AND THE TRACKING CHECK: READ ONLY, MODEL FREE.
//
// Two guarantees are checked here rather than declared, because the
// exit test depends on both:
//
//   > "Daily email arrives with only counted numbers"
//
//   no writes      the Supabase double FAILS THE TEST if insert,
//                  update, upsert or delete is ever called. An
//                  "onboarding audit" that modifies the thing it is
//                  auditing is not an audit
//   no model       globalThis.fetch FAILS THE TEST if called. If a
//                  number in the audit ever comes from a model, this
//                  file goes red
//
// And the trap migration 207 wrote down: visits went 28 to 31 while the
// owner tested his own site, and "at that traffic level his own clicks
// are most of the signal". Every count here excludes them, and a test
// proves the filter is on the query rather than on good intentions.

import { describe, it, expect, afterEach } from "vitest";
import { auditSite, auditCatalogue } from "@/lib/growth/audit";
import { checkTracking, conversionClaimsAllowed, measurementHealthLine } from "@/lib/growth/tracking";
import { scorable } from "@/lib/growth/findings";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
});

/** Fails the test if the audit asks a model anything. */
function forbidModelCalls() {
  globalThis.fetch = (async (url: any) => {
    throw new Error(`the audit must not call a model, but it fetched ${String(url)}`);
  }) as typeof fetch;
}

type Tables = Record<string, any[] | { error: { message: string } }>;

/** Records every filter, and refuses to write. */
function db(tables: Tables, seen: { filters: Record<string, any>[] } = { filters: [] }) {
  const client = {
    from(table: string) {
      const filters: Record<string, any> = { __table: table };
      const result = () => {
        const rows = tables[table];
        if (rows && !Array.isArray(rows)) return { data: null, error: (rows as any).error };
        let out = (rows ?? []) as any[];
        for (const [k, v] of Object.entries(filters)) {
          if (k.startsWith("__")) continue;
          out = out.filter((r) => (k in r ? r[k] === v : true));
        }
        return { data: out, error: null };
      };
      const chain: any = {
        select() { return chain; },
        eq(col: string, value: any) { filters[col] = value; return chain; },
        gte(col: string, value: any) { filters[`gte:${col}`] = value; return chain; },
        order() { return chain; },
        limit() { seen.filters.push({ ...filters }); return Promise.resolve(result()); },
        maybeSingle() { seen.filters.push({ ...filters }); const r = result(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
        then(resolve: any) { seen.filters.push({ ...filters }); return resolve(result()); },
        insert() { throw new Error(`the audit must not write: insert on ${table}`); },
        update() { throw new Error(`the audit must not write: update on ${table}`); },
        upsert() { throw new Error(`the audit must not write: upsert on ${table}`); },
        delete() { throw new Error(`the audit must not write: delete on ${table}`); },
      };
      return chain;
    },
  };
  return { client, seen };
}

describe("1. M1 — site health", () => {
  it("SAYS SO WHEN THERE IS NO SITE, and counts zero pages", async () => {
    forbidModelCalls();
    const { client } = db({ websites: [] });
    const r = await auditSite(client, "d1");
    expect(r.findings.map((f) => f.type)).toEqual(["site_missing"]);
    expect(r.counted).toEqual([{ label: "pages", value: 0, source: "website_pages" }]);
  });

  it("FINDS AN UNPUBLISHED SITE, a missing title, a missing description and a placeholder", async () => {
    forbidModelCalls();
    const { client } = db({
      websites: [{ id: "w1", slug: "a-business", published: false, dealership_id: "d1" }],
      website_pages: [
        { id: "p1", website_id: "w1", slug: "home", title: "Home", seo_title: "A title", meta_description: null, is_fallback: false },
        { id: "p2", website_id: "w1", slug: "about", title: "About", seo_title: null, meta_description: null, is_fallback: true },
      ],
    });
    const r = await auditSite(client, "d1");
    expect(r.findings.map((f) => f.type).sort()).toEqual([
      "pages_still_fallback",
      "pages_without_meta_description",
      "pages_without_search_title",
      "site_unpublished",
    ]);
    expect(r.counted.find((c) => c.label === "pages")!.value).toBe(2);
  });

  it("A FAILED READ IS NOT A FINDING", async () => {
    // Reporting "there is no website" because the database hiccuped
    // would put a false sentence in an owner's email, which is the one
    // thing the exit test exists to prevent.
    forbidModelCalls();
    const { client } = db({ websites: { error: { message: "boom" } } });
    const r = await auditSite(client, "d1");
    expect(r.findings).toEqual([]);
    expect(r.counted).toEqual([]);
  });

  it("and a healthy site produces nothing to report", async () => {
    forbidModelCalls();
    const { client } = db({
      websites: [{ id: "w1", published: true, dealership_id: "d1" }],
      website_pages: [{ id: "p1", website_id: "w1", seo_title: "T", meta_description: "D", is_fallback: false }],
    });
    expect((await auditSite(client, "d1")).findings).toEqual([]);
  });
});

describe("2. M2 — catalogue facts", () => {
  it("SAYS THE COPY HAS NOTHING TO CITE when the catalogue is empty", async () => {
    forbidModelCalls();
    const { client } = db({ products: [] });
    const r = await auditCatalogue(client, "d1");
    expect(r.findings.map((f) => f.type)).toEqual(["catalogue_empty"]);
  });

  it("FINDS MISSING DESCRIPTIONS, MISSING IMAGES AND A ZERO PRICE", async () => {
    forbidModelCalls();
    const { client } = db({
      products: [
        { id: "x1", dealership_id: "d1", name: "One", description: "has one", price: 999, images: ["a.jpg"] },
        { id: "x2", dealership_id: "d1", name: "Two", description: null, price: 0, images: [] },
      ],
    });
    const r = await auditCatalogue(client, "d1");
    expect(r.findings.map((f) => f.type).sort()).toEqual([
      "products_priced_zero",
      "products_without_description",
      "products_without_image",
    ]);
    expect(r.counted.find((c) => c.label === "products with a description")!.value).toBe(1);
  });
});

describe("3. every finding can actually be used", () => {
  it("IS SCORABLE AND CITES EVIDENCE — or the Strategist would drop it", async () => {
    forbidModelCalls();
    const { client } = db({
      websites: [{ id: "w1", published: false, dealership_id: "d1" }],
      website_pages: [{ id: "p1", website_id: "w1", seo_title: null, meta_description: null, is_fallback: true }],
      products: [{ id: "x1", dealership_id: "d1", description: null, price: 0, images: [] }],
    });
    const all = [...(await auditSite(client, "d1")).findings, ...(await auditCatalogue(client, "d1")).findings];
    expect(all.length).toBeGreaterThan(4);
    for (const f of all) {
      expect(scorable(f.score), f.type).toBe(true);
      expect(f.evidence.length, f.type).toBeGreaterThan(0);
      for (const e of f.evidence) {
        expect(String(e.kind).trim(), f.type).not.toBe("");
        expect(String(e.id).trim(), f.type).not.toBe("");
      }
    }
  });

  it("AND EVERY COUNTED NUMBER NAMES ITS SOURCE", async () => {
    forbidModelCalls();
    const { client } = db({
      websites: [{ id: "w1", published: true, dealership_id: "d1" }],
      website_pages: [{ id: "p1", website_id: "w1", seo_title: "T", meta_description: "D", is_fallback: false }],
      products: [{ id: "x1", dealership_id: "d1", description: "d", price: 9, images: ["a"] }],
    });
    const counted = [...(await auditSite(client, "d1")).counted, ...(await auditCatalogue(client, "d1")).counted];
    expect(counted.length).toBeGreaterThan(3);
    for (const c of counted) {
      expect(typeof c.value).toBe("number");
      expect(String(c.source).trim()).not.toBe("");
    }
  });
});

describe("4. T — the tracking check", () => {
  function tracked(over: Partial<Tables> = {}) {
    return db({
      page_events: [{ dealership_id: "d1", is_internal: false, created_at: "2026-10-22T10:00:00Z" }],
      dealerships: [{ id: "d1" }],
      ad_creatives: [],
      orders: [],
      ...over,
    });
  }

  it("EXCLUDES THE OWNER'S OWN VISITS — IN THE QUERY, not in a comment", async () => {
    // Migration 207's incident: 28 to 31 visits while he tested his own
    // site, "his own clicks are most of the signal".
    forbidModelCalls();
    const { client, seen } = tracked();
    await checkTracking(client, "d1", new Date("2026-10-23T00:00:00Z"));
    const eventQuery = seen.filters.find((f) => f.__table === "page_events");
    expect(eventQuery).toBeTruthy();
    expect(eventQuery!.is_internal).toBe(false);
  });

  it("COUNTS ONLY VISITOR EVENTS", async () => {
    forbidModelCalls();
    const { client } = tracked({
      page_events: [
        { dealership_id: "d1", is_internal: false, created_at: "2026-10-22T10:00:00Z" },
        { dealership_id: "d1", is_internal: true, created_at: "2026-10-22T11:00:00Z" },
        { dealership_id: "d1", is_internal: true, created_at: "2026-10-22T12:00:00Z" },
      ],
    });
    const t = await checkTracking(client, "d1", new Date("2026-10-23T00:00:00Z"));
    expect(t.siteEvents.visitorEvents30d).toBe(1);
  });

  it("IS BROKEN WHEN NOTHING IS FIRING", async () => {
    forbidModelCalls();
    const { client } = tracked({ page_events: [] });
    const t = await checkTracking(client, "d1", new Date("2026-10-23T00:00:00Z"));
    expect(t.siteEvents.firing).toBe(false);
    expect(t.health).toBe("broken");
  });

  it("IS PARTIAL WHEN EVENTS ARRIVE BUT THE REST IS UNVERIFIED", async () => {
    forbidModelCalls();
    const { client } = tracked();
    const t = await checkTracking(client, "d1", new Date("2026-10-23T00:00:00Z"));
    expect(t.health).toBe("partial");
    expect(t.searchConsole.connected).toBe(false);
  });

  it("A CAMPAIGN WITH NO PAID ORDER IS NOT A VERIFIED CONVERSION", async () => {
    // Otherwise an ROI claim stands on a configuration screen.
    forbidModelCalls();
    const { client } = tracked({ ad_creatives: [{ id: "c1", dealership_id: "d1" }] });
    const t = await checkTracking(client, "d1", new Date("2026-10-23T00:00:00Z"));
    expect(t.adsConversions.verified).toBe(false);
    expect(t.adsConversions.why).toMatch(/no paid order/);
    expect(conversionClaimsAllowed(t)).toBe(false);
  });

  it("and a campaign WITH one is", async () => {
    forbidModelCalls();
    const { client } = tracked({
      ad_creatives: [{ id: "c1", dealership_id: "d1" }],
      orders: [{ id: "o1", dealership_id: "d1", payment_status: "paid", created_at: "2026-10-22T10:00:00Z" }],
    });
    const t = await checkTracking(client, "d1", new Date("2026-10-23T00:00:00Z"));
    expect(t.adsConversions.verified).toBe(true);
    expect(conversionClaimsAllowed(t)).toBe(true);
  });

  it("THE HEALTH LINE SAYS THE OWNER'S VISITS WERE EXCLUDED", async () => {
    // So a number he can compare against his own analytics does not
    // read as a contradiction.
    forbidModelCalls();
    const { client } = tracked();
    const line = measurementHealthLine(await checkTracking(client, "d1", new Date("2026-10-23T00:00:00Z")));
    expect(line).toMatch(/^Measurement health: PARTIAL\./);
    expect(line).toMatch(/your own visits excluded/);
    expect(line).toMatch(/not verified/);
  });

  it("and names a trade nowhere", async () => {
    forbidModelCalls();
    const { client } = tracked();
    const line = measurementHealthLine(await checkTracking(client, "d1", new Date("2026-10-23T00:00:00Z")));
    expect(line).not.toMatch(/candle|ghee|salon|dairy|paneer/i);
  });
});

describe("EVERY NUMBER A FINDING STATES IS A NUMBER THE AUDIT DECLARED", () => {
  // WHAT THIS COST, 3 November 2026. The daily report's digit walk
  // refuses any figure it cannot trace to something counted. The
  // founder confirmed two goals, suggestions became renderable for the
  // first time, and the whole email was dropped over the "5" in "5
  // pages have no search title" — because the audit had counted those
  // five pages and declared only the COMPLEMENT, "pages with a search
  // title: 1". The number every finding talks about was the one number
  // nobody declared.
  //
  // TWO MORE WERE ASLEEP BEHIND IT: pages_without_meta_description and
  // products_priced_zero state counts that were not declared either,
  // and would each have dropped an email the day their goal went
  // active.
  //
  // So this test is about the CLASS, not the instance: it walks every
  // digit of every finding title and requires it in counted ∪
  // alsoCounted. A new finding whose title states an undeclared count
  // fails here rather than silencing somebody's morning email.

  const digitsIn = (text: string) => (text.match(/\d[\d,.]*/g) ?? []).map((d) => d.replace(/[.,]+$/, ""));

  function assertEveryTitleNumberDeclared(result: { findings: any[]; counted: any[]; alsoCounted?: any[] }) {
    const declared = new Set(
      [...result.counted, ...(result.alsoCounted ?? [])].flatMap((c) => [String(c.value), c.value.toLocaleString("en-IN")])
    );
    const offenders: string[] = [];
    for (const finding of result.findings) {
      for (const digit of digitsIn(String(finding.title))) {
        if (!declared.has(digit)) offenders.push(`${finding.type}: "${finding.title}" has ${digit}`);
      }
    }
    expect(offenders, `undeclared numbers in finding titles:\n${offenders.join("\n")}`).toEqual([]);
  }

  it("THE SITE AUDIT, on the exact shape that dropped the email", async () => {
    // Six pages, five with no search title — candle_by_qaaf on 3 Nov.
    const pages = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      website_id: "w1",
      slug: `page-${i}`,
      title: "T",
      seo_title: i === 0 ? "A title" : null,
      meta_description: "d",
      is_fallback: false,
    }));
    const result = await auditSite(
      db({ websites: [{ id: "w1", slug: "s", published: true, dealership_id: "d1" }], website_pages: pages }).client,
      "d1"
    );
    expect(result.findings.find((f) => f.type === "pages_without_search_title")!.title).toMatch(/^5 pages have/);
    assertEveryTitleNumberDeclared(result);
  });

  it("AND WITH EVERY SITE FINDING AT ONCE, including the two that were asleep", async () => {
    const pages = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      website_id: "w1",
      slug: `page-${i}`,
      title: "T",
      seo_title: i < 2 ? "A title" : null,
      meta_description: i < 4 ? "d" : null,
      is_fallback: i === 6,
    }));
    const result = await auditSite(
      db({ websites: [{ id: "w1", slug: "s", published: false, dealership_id: "d1" }], website_pages: pages }).client,
      "d1"
    );
    // 5 with no title, 3 with no description, 1 placeholder, plus the
    // unpublished finding, which states no number at all.
    expect(result.findings.length).toBeGreaterThanOrEqual(4);
    assertEveryTitleNumberDeclared(result);
  });

  it("THE CATALOGUE AUDIT, with all three of its findings", async () => {
    // NINE PRODUCTS, AND EVERY COUNT DISTINCT. The first version of
    // this used three products, where the deficits happened to equal
    // the complements — so removing a deficit from the declared set
    // changed nothing and two mutations survived. The fixture, not the
    // guard, was the hole: 4 with no description, 6 with no image, 7
    // priced at zero, against totals of 9, 5 and 3.
    const products = Array.from({ length: 9 }, (_, i) => ({
      id: `x${i}`,
      dealership_id: "d1",
      name: "P",
      description: i < 4 ? null : "d",
      price: i < 7 ? 0 : 700,
      images: i < 6 ? [] : ["u"],
    }));
    const result = await auditCatalogue(db({ products }).client, "d1");
    // Each number a title states is in exactly one place.
    expect(result.findings.find((f) => f.type === "products_without_description")!.title).toMatch(/^4 of 9 /);
    expect(result.findings.find((f) => f.type === "products_without_image")!.title).toMatch(/^6 of 9 /);
    expect(result.findings.find((f) => f.type === "products_priced_zero")!.title).toMatch(/^7 products/);
    expect(result.findings.map((f) => f.type).sort()).toEqual([
      "products_priced_zero",
      "products_without_description",
      "products_without_image",
    ]);
    assertEveryTitleNumberDeclared(result);
  });

  it("AND AN EMPTY SITE AND AN EMPTY CATALOGUE STATE NO UNDECLARED NUMBER EITHER", async () => {
    assertEveryTitleNumberDeclared(await auditSite(db({ websites: [] }).client, "d1"));
    assertEveryTitleNumberDeclared(await auditCatalogue(db({ products: [] }).client, "d1"));
  });

  it("and the check itself would have caught the old behaviour", () => {
    // A path mistake or a too-generous `declared` set would make every
    // assertion above pass on nothing. This proves the walk bites.
    const broken = {
      findings: [{ type: "t", title: "5 pages have no search title" }],
      counted: [{ label: "pages with a search title", value: 1, source: "s" }],
      alsoCounted: [],
    };
    expect(() => assertEveryTitleNumberDeclared(broken)).toThrow();
  });
});
