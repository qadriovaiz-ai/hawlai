// A page can be written before it is public (G3a of
// docs/AUDIT-GROWTH-LOOP.md).
//
// THIS FIXES SOMETHING THAT IS ALREADY WRONG, rather than only
// unblocking G3. `website_pages` had no published flag of its own: a
// site was published or not, and every page on a published site was
// reachable the moment its row existed. So the Add Page button put an
// EMPTY page on the live site, at a real URL, before the owner had
// written a word of it.
//
// AND A1 MADE IT WORSE, which is mine. /sitemap.xml lists every page of
// every published site, so from 6 November an empty page was advertised
// to crawlers the moment it was created. Before that it could at least
// only be found by following a link, and there was no link.
//
// WHY G3 NEEDS IT: G3 proposes a page from a real search gap and creates
// it on approval. Without a draft state, approving that proposal would
// publish an empty page and put it in the sitemap — the product doing,
// on its own initiative, exactly what this prevents.

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { code, sql } from "./helpers/source";

import { publishedPages } from "@/lib/seo/crawlers";

type Row = Record<string, any>;

/** A query recorder, so the filters themselves can be asserted. */
function db(rows: { sites?: Row[]; pages?: Row[] } = {}) {
  const calls: { table: string; filters: string[] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, filters: [] as string[] };
      calls.push(call);
      const chain: any = {
        select: () => chain,
        eq: (col: string, value: unknown) => {
          call.filters.push(`${col}=${String(value)}`);
          return chain;
        },
        in: (col: string, values: unknown[]) => {
          call.filters.push(`${col} in ${values.length}`);
          return chain;
        },
        limit: async () => ({ data: table === "websites" ? rows.sites ?? [] : rows.pages ?? [], error: null }),
        then: (resolve: any) => resolve({ data: table === "websites" ? rows.sites ?? [] : rows.pages ?? [], error: null }),
      };
      return chain;
    },
  };
  return { client, calls };
}

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------
describe("1. THE MIGRATION DEFAULTS TO true, AND THAT IS THE IMPORTANT HALF", () => {
  const m = sql("supabase/migrations/223_page_draft.sql");

  it("A PAGE THAT WAS LIVE BEFORE THE MIGRATION IS STILL LIVE AFTER IT", () => {
    // Every page that existed when this column was added was already
    // live. A default of false would have unpublished a whole platform's
    // worth of pages the moment the migration ran.
    expect(m).toMatch(/add column if not exists published boolean not null default true/);
  });

  it("AND IT SHIPS THE QUERY THAT PROVES NOTHING WAS TAKEN DOWN", () => {
    const raw = readFileSync("supabase/migrations/223_page_draft.sql", "utf8");
    expect(raw).toMatch(/count\(\*\) filter \(where published\) as live/);
    expect(raw).toMatch(/the two numbers are EQUAL/);
  });

  it("the column says what it is for, where psql will print it", () => {
    expect(m).toMatch(/comment on column website_pages\.published is/);
    expect(m).toMatch(/listed in \/sitemap\.xml/);
  });

  it("AND THE MIGRATION RECORDS THAT A1 MADE THE HAZARD WORSE", () => {
    // The comment is the only thing that stops this column being read as
    // a feature request later. It was a live fault, and part of it was
    // mine.
    const raw = readFileSync("supabase/migrations/223_page_draft.sql", "utf8");
    expect(raw).toMatch(/A1 added \/sitemap\.xml/);
  });
});

// ---------------------------------------------------------------------
describe("2. A DRAFT IS NOT IN THE SITEMAP", () => {
  it("THE INNER-PAGE READ FILTERS ON published", () => {
    const { client, calls } = db({ sites: [{ id: "w1", slug: "a-shop" }], pages: [] });
    return publishedPages(client as any).then(() => {
      const pageRead = calls.find((c) => c.table === "website_pages")!;
      expect(pageRead.filters).toContain("published=true");
    });
  });

  it("AND THE SITE READ STILL FILTERS ON ITS OWN published", () => {
    // Two different flags, both needed: an unpublished SITE lists
    // nothing, and a published site lists only its published pages.
    const { client, calls } = db({ sites: [{ id: "w1", slug: "a-shop" }], pages: [] });
    return publishedPages(client as any).then(() => {
      const siteRead = calls.find((c) => c.table === "websites")!;
      expect(siteRead.filters).toContain("published=true");
    });
  });

  it("the filter is in the source with the reason beside it", () => {
    const src = code("src/lib/seo/crawlers.ts");
    expect(src).toMatch(/\.eq\("published", true\)\s*\n\s*\.in\("website_id", ids\)/);
  });
});

// ---------------------------------------------------------------------
describe("3. A DRAFT IS NOT FOUND ON THE LIVE SITE", () => {
  const route = code("src/app/site/[slug]/[page]/page.tsx");

  it("THE PAGE ROUTE READS THE FLAG AND 404s ON A DRAFT", () => {
    expect(route).toMatch(/\.select\("sections, published"\)/);
    expect(route).toMatch(/if \(!page \|\| page\.published === false\) notFound\(\)/);
  });

  it("STRICTLY === false, so a row from before the migration still renders", () => {
    // An older row read through a client that does not return the column
    // gives undefined, which is not false — and that page was live
    // before, so it stays live.
    expect(route).not.toMatch(/if \(!page \|\| !page\.published\)/);
  });

  it("AND THE SITE'S OWN FLAG IS STILL CHECKED FIRST", () => {
    const siteAt = route.indexOf("!website.published");
    const pageAt = route.indexOf("page.published === false");
    expect(siteAt).toBeGreaterThan(-1);
    expect(pageAt).toBeGreaterThan(siteAt);
  });
});

// ---------------------------------------------------------------------
describe("4. A NEW PAGE STARTS AS A DRAFT", () => {
  const route = code("src/app/api/website-builder/pages/route.ts");

  it("ADD PAGE NO LONGER PUTS AN EMPTY PAGE ON THE LIVE SITE", () => {
    // The two blocks it creates are a heading and an EMPTY paragraph.
    expect(route).toMatch(/published: false,\n  \}\)\.select\("\*"\)\.single\(\)/);
  });

  it("AND NOR DOES DUPLICATING ONE", () => {
    // Two live pages with the same words is G1's `duplicate_body`
    // finding, arriving by the owner's own click.
    const duplicate = route.slice(route.indexOf("if (duplicateFrom)"), route.indexOf("if (!title?.trim())"));
    expect(duplicate).toMatch(/published: false,/);
  });

  it("there are exactly two inserts and both start unpublished", () => {
    const inserts = (route.match(/published: false,/g) ?? []).length;
    expect(inserts).toBe(2);
  });
});

// ---------------------------------------------------------------------
describe("5. PUBLISHING IS THE OWNER'S CLICK, AND TAKING IT DOWN IS NEVER HARDER", () => {
  const api = code("src/app/api/website-builder/pages/[id]/route.ts");
  const ui = code("src/components/website-builder/WebsiteBuilderView.tsx");

  it("THE ROUTE ACCEPTS THE FLAG, STRICTLY AS A BOOLEAN", () => {
    // A page going public is not a truthiness question: the string
    // "false" must not publish one.
    expect(api).toMatch(/if \(typeof body\.published === "boolean"\) update\.published = body\.published;/);
  });

  it("AND PUBLISHING IS NOT A SIDE EFFECT OF SAVING", () => {
    // Saving is something people do halfway through writing.
    const save = ui.slice(ui.indexOf("async function savePage"), ui.indexOf("const currentPage ="));
    expect(save).not.toMatch(/published/);
  });

  it("THE BUILDER CAN DO BOTH, through one call", () => {
    expect(ui).toMatch(/async function setPagePublished\(pageId: string, published: boolean\)/);
    expect(ui).toMatch(/Publish this page/);
    expect(ui).toMatch(/Take this page down/);
  });

  it("A DRAFT SAYS IT IS ONE", () => {
    // A page the owner cannot find on the live site, with no
    // explanation, is worse than one that was published empty — at
    // least that was visible.
    expect(ui).toMatch(/isn&apos;t live yet/);
    expect(ui).toMatch(/isn&apos;t in your sitemap/);
  });

  it("and adding a page is not a dead end", () => {
    // Without a publish control a new page could never go up, which
    // would be a regression on what the owner had before.
    expect(ui).toMatch(/setPagePublished\(currentPage\.id, \(currentPage as any\)\.published === false\)/);
  });
});
