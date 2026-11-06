// robots.txt, the sitemap, and llms.txt — A1 of PLAN-AEO-GEO.md.
//
// MEASURED BEFORE ANY OF IT WAS WRITTEN: this repository had no
// robots.txt and no sitemap of any kind. Not restrictive ones — none.
// So every crawler was already allowed, by absence, and a storefront at
// hawlai.online/site/{slug} could be found only by following a link
// from somewhere there wasn't one.
//
// THE FOUR THINGS THAT MATTER, each with one way of being wrong:
//
//   1. A CRAWLER MUST ACTUALLY REACH THEM. The middleware runs for
//      /robots.txt — the matcher excludes static assets and not this —
//      and they were in no public list, so the answer was a 307 to
//      /auth/login. A robots.txt that redirects is a robots.txt that
//      does not exist, and it would have looked finished. Migration
//      168 recorded this exact fault for /api/events/dispatch.
//   2. NOTHING MAY BE NEWLY BLOCKED. There was no robots.txt, so
//      everything was allowed; writing one that disallows an answer
//      engine would be a regression dressed as progress.
//   3. ONLY PUBLISHED SITES GO IN THE SITEMAP. An unpublished site is a
//      draft the owner has not shown anyone.
//   4. AND llms.txt MUST NOT CLAIM ANYTHING. Nothing measures whether
//      it helps.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ANSWER_ENGINE_CRAWLERS,
  PRIVATE_PATHS,
  SITEMAP_MAX_URLS,
  llmsTxt,
  optedOutSlugs,
  publishedPages,
  storefrontUrl,
} from "@/lib/seo/crawlers";
import { isPublicPath } from "@/lib/supabase/middleware";
import { code, sourceWithComments } from "./helpers/source";

/**
 * ONE MOCK, SWITCHED PER TEST.
 *
 * The first version used `vi.doMock` inside each test and then
 * imported the route. The module is cached after the first import, so
 * every later test got the FIRST test's database — and the opt-out
 * assertion failed against an empty opt-out list. A per-test doMock
 * without resetModules is a mock that silently applies once.
 */
let current: any = null;
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => current }));

afterEach(() => {
  current = null;
  vi.restoreAllMocks();
});

/** The two tables these routes read, in the shapes they read them. */
function db(opts: { sites?: any[]; pages?: any[]; sitesError?: string; pagesError?: string; optOutError?: string; optedOut?: any[] } = {}) {
  const seen: Record<string, any> = {};
  const client = {
    from(table: string) {
      const chain: any = {
        _filters: {} as Record<string, any>,
        _select: "",
        select(cols: string) {
          chain._select = cols;
          return chain;
        },
        eq(col: string, value: any) {
          chain._filters[col] = value;
          seen[`eq:${col}`] = value;
          return chain;
        },
        in: () => chain,
        limit: () => chain._resolve(),
        _resolve() {
          if (table === "websites" && chain._select.includes("ai_crawl_opt_out")) {
            return opts.optOutError
              ? Promise.resolve({ data: null, error: { message: opts.optOutError } })
              : Promise.resolve({ data: opts.optedOut ?? [], error: null });
          }
          if (table === "websites") {
            return opts.sitesError
              ? Promise.resolve({ data: null, error: { message: opts.sitesError } })
              : Promise.resolve({ data: (opts.sites ?? []).filter((s) => !("published" in chain._filters) || s.published === chain._filters.published), error: null });
          }
          if (table === "website_pages") {
            return opts.pagesError
              ? Promise.resolve({ data: null, error: { message: opts.pagesError } })
              : Promise.resolve({ data: opts.pages ?? [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        then: (resolve: any) => chain._resolve().then(resolve),
      };
      return chain;
    },
  };
  return { client, seen };
}

describe("1. A CRAWLER CAN ACTUALLY REACH THEM", () => {
  it("ALL THREE ARE PUBLIC, OR THEY ANSWER WITH A REDIRECT TO THE LOGIN PAGE", () => {
    // The load-bearing test of this phase. The middleware's matcher
    // excludes static assets and NOT these, so it runs for them — and
    // before A1 they were in no public list. A robots.txt that 307s to
    // /auth/login is a robots.txt that does not exist, and the file
    // would have looked finished.
    for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt"]) {
      expect(isPublicPath(path), `${path} redirects an anonymous crawler to the login page`).toBe(true);
    }
  });

  it("AND THE PRIVATE HALF OF THE APP IS STILL NOT PUBLIC", () => {
    // The opposite failure, and the dangerous one: a public list that
    // grew a prefix nobody chose.
    for (const path of ["/dashboard", "/dashboard/autopilot", "/robots.txtanything", "/sitemap.xml/../dashboard"]) {
      expect(isPublicPath(path), `${path} became public`).toBe(false);
    }
  });

  it("the exact list is exact, not a set of prefixes", () => {
    // `/robots.txt` as a PREFIX would also admit /robots.txtanything.
    // There is no such route, so it would be harmless and sloppy — and
    // this is the one file where sloppy about what is public is the
    // wrong kind of mistake.
    const src = code("src/lib/supabase/middleware.ts");
    expect(src).toMatch(/PUBLIC_EXACT_PATHS\.includes\(pathname\)/);
    expect(src).not.toMatch(/PUBLIC_EXACT_PATHS\.some\(/);
  });
});

describe("2. NOTHING IS NEWLY BLOCKED", () => {
  it("EVERY ANSWER ENGINE IS NAMED AND ALLOWED", async () => {
    // There was no robots.txt, so everything was already allowed. This
    // writes the permission down; a rule that disallowed one of these
    // would be a regression dressed as progress.
    vi.spyOn(console, "log").mockImplementation(() => {});
    current = db().client;
    const robots = (await import("@/app/robots")).default;
    const out = await robots();

    for (const bot of ANSWER_ENGINE_CRAWLERS) {
      const rule = (out.rules as any[]).find((r) => r.userAgent === bot);
      expect(rule, `${bot} is not named in robots.txt`).toBeTruthy();
      expect(rule.allow, `${bot} is not allowed`).toBe("/");
      expect(rule.disallow, `${bot} is disallowed from the storefronts`).not.toContain("/site/");
    }
    // And the wildcard rule still allows everything public.
    const all = (out.rules as any[]).find((r) => r.userAgent === "*");
    expect(all.allow).toBe("/");
  });

  it("THE PRIVATE PATHS ARE DISALLOWED, for every rule", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    current = db().client;
    const robots = (await import("@/app/robots")).default;
    const out = await robots();
    for (const rule of out.rules as any[]) {
      for (const path of PRIVATE_PATHS) {
        expect(rule.disallow, `${rule.userAgent} may crawl ${path}`).toContain(path);
      }
    }
  });

  it("AND IT POINTS AT THE SITEMAP, which is the half that does something", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    current = db().client;
    const out = await (await import("@/app/robots")).default();
    expect(String(out.sitemap)).toMatch(/\/sitemap\.xml$/);
  });

  it("Google-Extended is named even though it changes nothing today", () => {
    // It is opt-OUT only, so naming it permits nothing new. It is the
    // line somebody would edit to opt out, and it should be visible
    // rather than absent — which is the whole argument of this phase.
    expect([...ANSWER_ENGINE_CRAWLERS]).toContain("Google-Extended");
    expect(sourceWithComments("src/lib/seo/crawlers.ts")).toMatch(/opt-OUT only/);
  });
});

describe("3. AN OPTED-OUT STOREFRONT IS EXCLUDED FROM THE ANSWER ENGINES ONLY", () => {
  it("IT LEAVES THE AI RULES AND STAYS IN THE WILDCARD ONE", async () => {
    // The distinction is the point: a business that does not want its
    // copy read by an AI is still in Google's blue links and in Maps.
    vi.spyOn(console, "log").mockImplementation(() => {});
    current = db({ optedOut: [{ slug: "quiet-shop" }] }).client;
    const out = await (await import("@/app/robots")).default();

    const gpt = (out.rules as any[]).find((r) => r.userAgent === "GPTBot");
    expect(gpt.disallow).toContain("/site/quiet-shop");
    const all = (out.rules as any[]).find((r) => r.userAgent === "*");
    expect(all.disallow, "an AI opt-out hid the business from Google too").not.toContain("/site/quiet-shop");
  });

  it("AND A COLUMN THAT DOES NOT EXIST YET EXCLUDES NOBODY", async () => {
    // Nobody has asked for the opt-out, so no column holds the answer.
    // This is the normal state today, and the route must answer rather
    // than fail — a 500 on robots.txt is a signal nobody sees.
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: any[]) => void logs.push(a.join(" ")));
    const d = db({ optOutError: 'column dealerships.ai_crawl_opt_out does not exist' });
    expect(await optedOutSlugs(d.client)).toEqual([]);
    expect(logs.join("\n")).toMatch(/no AI opt-out column yet/);
  });

  it("and a thrown read excludes nobody either, loudly", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const thrower = { from: () => { throw new Error("connection reset"); } };
    expect(await optedOutSlugs(thrower)).toEqual([]);
    expect(errors.join("\n")).toMatch(/could not read AI crawl opt-outs/);
  });
});

describe("4. THE SITEMAP LISTS PUBLISHED PAGES AND NOTHING ELSE", () => {
  it("PUBLISHED ONLY — an unpublished site is a draft nobody has shown", async () => {
    const d = db({
      sites: [
        { id: "w1", slug: "live-shop", published: true, updated_at: "2026-11-01T00:00:00Z" },
        { id: "w2", slug: "draft-shop", published: false, updated_at: null },
      ],
    });
    const pages = await publishedPages(d.client);
    expect(pages!.map((p) => p.slug)).toEqual(["live-shop"]);
    expect(d.seen["eq:published"], "the query did not filter on published").toBe(true);
  });

  it("THE HOME PAGE IS LISTED ONCE, not twice", async () => {
    // The site root and /site/{slug}/home are the same page. Two URLs
    // for one page is the commonest sitemap mistake there is.
    const d = db({
      sites: [{ id: "w1", slug: "shop", published: true, updated_at: null }],
      pages: [
        { website_id: "w1", slug: "home", updated_at: null },
        { website_id: "w1", slug: "about", updated_at: null },
      ],
    });
    const pages = await publishedPages(d.client);
    const urls = pages!.map((p) => storefrontUrl("https://hawlai.online", p));
    expect(urls).toEqual(["https://hawlai.online/site/shop", "https://hawlai.online/site/shop/about"]);
  });

  it("AND A FAILED READ IS null, NOT AN EMPTY PLATFORM", async () => {
    // An empty sitemap and a broken one look identical to a crawler.
    // The caller should be able to say which happened.
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await publishedPages(db({ sitesError: "boom" }).client)).toBeNull();
  });

  it("AND IF ONLY THE INNER PAGES FAIL, THE HOME PAGES STILL GO IN", async () => {
    // Half a sitemap beats none, and the reason is logged rather than
    // swallowed.
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: any[]) => void errors.push(a.join(" ")));
    const pages = await publishedPages(db({ sites: [{ id: "w1", slug: "shop", published: true }], pagesError: "boom" }).client);
    expect(pages!.map((p) => p.pageSlug)).toEqual([null]);
    expect(errors.join("\n")).toMatch(/only home pages are listed/);
  });

  it("and it is bounded, because a sitemap is not a database dump", () => {
    expect(SITEMAP_MAX_URLS).toBeGreaterThan(100);
    expect(SITEMAP_MAX_URLS).toBeLessThanOrEqual(50000);
    expect(code("src/lib/seo/crawlers.ts")).toMatch(/\.limit\(SITEMAP_MAX_URLS\)/);
  });

  it("AND NO lastModified IS INVENTED", () => {
    // A crawler reading a made-up date learns to distrust all of them.
    const src = code("src/app/sitemap.ts");
    expect(src).toMatch(/page\.updatedAt \? new Date\(page\.updatedAt\) : undefined/);
    expect(src, "a date is defaulted to now").not.toMatch(/lastModified: new Date\(\)/);
  });
});

describe("5. llms.txt PROMISES NOTHING", () => {
  const sites = [{ slug: "qaaf", name: "Candle by Qaaf", city: "Shahjahanpur", category: "candles" }];

  it("THE FILE SAYS IT IS A PROPOSAL AND NOT A STANDARD", () => {
    // The founder asked for an assessment and this is it, written into
    // the artefact rather than only into the plan: nothing measures
    // whether this helps, so the file does not imply that it does.
    const body = llmsTxt("https://hawlai.online", sites);
    expect(body).toMatch(/not a\s*\nstandard|not a standard/);
    expect(body).toMatch(/no answer engine has committed to reading it/);
    // AND IT POINTS AT WHAT IS AUTHORITATIVE.
    expect(body).toMatch(/\/sitemap\.xml/);
    expect(body).toMatch(/authoritative/);
  });

  it("AND IT LISTS THE BUSINESSES, WITH NOTHING INVENTED ABOUT THEM", () => {
    const body = llmsTxt("https://hawlai.online", sites);
    expect(body).toContain("[Candle by Qaaf, Shahjahanpur](https://hawlai.online/site/qaaf)");
    expect(body).toContain("— candles");
    // A business with no city or category says less, rather than
    // guessing either.
    const bare = llmsTxt("https://hawlai.online", [{ slug: "x", name: "A Shop", city: null, category: null }]);
    expect(bare).toContain("[A Shop](https://hawlai.online/site/x)");
    expect(bare).not.toMatch(/undefined|null|—\s*$/m);
  });

  it("and an empty platform says so rather than showing an empty list", () => {
    expect(llmsTxt("https://hawlai.online", [])).toMatch(/No published storefronts yet/);
  });

  it("THE ROUTE ANSWERS EVEN WHEN THE LIST CANNOT BE BUILT", () => {
    // A file nobody has committed to reading is not worth a 500 on the
    // domain root — and an empty list would read as "no businesses
    // here", which is a claim.
    const src = code("src/app/llms.txt/route.ts");
    expect(src).toMatch(/could not be read just now/);
    expect(src, "the route throws or returns a 500").not.toMatch(/status: 5\d\d/);
  });

  it("and the assessment is in the plan as well as the file", () => {
    const plan = sourceWithComments("docs/PLAN-AEO-GEO.md");
    expect(plan).toMatch(/not worth a phase/);
    expect(plan).toMatch(/is a \*\*proposal\*\*, not a standard/);
  });
});
