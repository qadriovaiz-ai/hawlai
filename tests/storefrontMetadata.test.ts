// What the storefront actually serves in its <title> and
// <meta name="description">.
//
// These go through the route's own generateMetadata and then through
// Next's rendering of that object into tags — deliberately NOT through a
// read of website_pages. A database row is not what Google sees, and
// asserting on the row is how chat came to tell an owner their meta
// description was set when nothing public had changed (2026-09-28).

import { describe, it, expect, vi, beforeEach } from "vitest";

type PageRow = { title?: string | null; seo_title?: string | null; meta_description?: string | null; og_image_url?: string | null };

const store: { website: any; page: PageRow | null; failOnColumn?: string | null } = { website: null, page: null, failOnColumn: null };

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from(table: string) {
      const chain: any = {
        _select: "",
        select: (columns: string) => {
          chain._select = columns;
          return chain;
        },
        eq: () => chain,
        maybeSingle: async () => {
          if (table === "websites") return { data: store.website };
          // A column this database does not have yet fails the whole
          // query — the deploy-before-migration case.
          if (store.failOnColumn && chain._select.includes(store.failOnColumn)) {
            return { data: null, error: { message: `column website_pages.${store.failOnColumn} does not exist` } };
          }
          const { seo_title, ...withoutSeoTitle } = store.page ?? ({} as PageRow);
          return { data: store.page ? (store.failOnColumn ? withoutSeoTitle : store.page) : null };
        },
      };
      return chain;
    },
  }),
}));

import { readFileSync } from "fs";
import { generateMetadata as homeMetadata } from "../src/app/site/[slug]/page";
import { generateMetadata as innerMetadata } from "../src/app/site/[slug]/[page]/page";
// The SAME parser the read-back uses against the real live page, so a
// title that passes here is one production would confirm as live.
import { parseTitle, parseDescription } from "../src/lib/seo/liveMeta";

/** Title and description as read back OUT of the rendered markup. */
function served(metadata: any): { title: string | null; description: string | null } {
  const html = renderTags(metadata);
  return { title: parseTitle(html), description: parseDescription(html) };
}

/**
 * The tags a browser would receive, rendered from the Metadata object
 * the route returns — so a test reads the same string a person would
 * find in View Source.
 */
function renderTags(metadata: any): string {
  const parts = [`<title>${escapeHtml(String(metadata.title ?? ""))}</title>`];
  if (metadata.description) parts.push(`<meta name="description" content="${escapeHtml(String(metadata.description))}"/>`);
  return parts.join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

const OWNER_DESCRIPTION =
  "Hand-poured soy candles made by hand in Shahjahanpur, in small batches, with fragrance that lasts the whole evening. Shop now.";

describe("the storefront homepage's rendered metadata", () => {
  beforeEach(() => {
    store.website = { id: "w1", dealerships: { dealership_name: "candle_by_qaaf" } };
    store.page = { title: "Home", seo_title: null, meta_description: null };
    store.failOnColumn = null;
  });

  it("uses the search title the owner set", async () => {
    store.page = { title: "Home", seo_title: "Handmade Soy Candles in Shahjahanpur | Candle by Qaaf", meta_description: OWNER_DESCRIPTION };
    const page = served(await homeMetadata({ params: Promise.resolve({ slug: "qaaf" }) } as any));
    expect(page.title).toBe("Handmade Soy Candles in Shahjahanpur | Candle by Qaaf");
    // Character for character out of the markup — the town and the call
    // to action included, with the apostrophes and entities decoded the
    // way a browser decodes them.
    expect(page.description).toBe(OWNER_DESCRIPTION);
  });

  it("falls back to the business name FORMATTED, never the signup handle", async () => {
    const page = served(await homeMetadata({ params: Promise.resolve({ slug: "qaaf" }) } as any));
    expect(page.title).toBe("Candle by Qaaf");
    expect(renderTags(await homeMetadata({ params: Promise.resolve({ slug: "qaaf" }) } as any))).not.toContain("candle_by_qaaf");
  });

  it('never renders the nav label "Home" as the title', async () => {
    // Every site websiteBuilderAgent generates starts with
    // { slug: "home", title: "Home" } — that string is the menu link.
    // Using it as the title tag would put "Home" in the browser tab and
    // the search result of every business in the product.
    store.page = { title: "Home", seo_title: null };
    const page = served(await homeMetadata({ params: Promise.resolve({ slug: "qaaf" }) } as any));
    expect(page.title).not.toBe("Home");
    expect(page.title).toBe("Candle by Qaaf");
  });

  it("keeps a homepage title the owner renamed in the menu", async () => {
    store.page = { title: "Welcome", seo_title: null };
    expect(served(await homeMetadata({ params: Promise.resolve({ slug: "qaaf" }) } as any)).title).toBe("Welcome");
  });

  it("still serves a real title on a database without migration 203", async () => {
    // The column decides the title of every public page in the product.
    // If a deploy lands before the migration, naming it would fail the
    // whole query and put "Page not found" in every browser tab.
    store.failOnColumn = "seo_title";
    store.page = { title: "Home", meta_description: OWNER_DESCRIPTION };
    const page = served(await homeMetadata({ params: Promise.resolve({ slug: "qaaf" }) } as any));
    expect(page.title).toBe("Candle by Qaaf");
    expect(page.description).toBe(OWNER_DESCRIPTION);
    store.failOnColumn = null;
  });

  it("has no description tag at all when none is set, rather than an empty one", async () => {
    const metadata = await homeMetadata({ params: Promise.resolve({ slug: "qaaf" }) } as any);
    expect(renderTags(metadata)).not.toContain('name="description"');
    expect(served(metadata).description).toBeNull();
  });
});

describe("an inner page's rendered metadata", () => {
  beforeEach(() => {
    store.website = { id: "w1", dealerships: { dealership_name: "candle_by_qaaf" } };
    store.page = { title: "About", seo_title: null, meta_description: "Who we are." };
  });

  it("reads '<page> | <business>' when no search title is set", async () => {
    expect(served(await innerMetadata({ params: Promise.resolve({ slug: "qaaf", page: "about" }) } as any)).title).toBe("About | Candle by Qaaf");
  });

  it("uses the search title instead when there is one", async () => {
    store.page = { title: "About", seo_title: "Our story — candles poured in Shahjahanpur", meta_description: "Who we are." };
    expect(served(await innerMetadata({ params: Promise.resolve({ slug: "qaaf", page: "about" }) } as any)).title).toBe("Our story — candles poured in Shahjahanpur");
  });

  it("says the page is missing rather than rendering a blank title", async () => {
    store.page = null;
    expect(served(await innerMetadata({ params: Promise.resolve({ slug: "qaaf", page: "ghost" }) } as any)).title).toBe("Page not found");
  });
});

describe("the storefront's own header and footer", () => {
  it("shows the business name formatted, never the signup handle", () => {
    // The <title> has read businessDisplayName since migration 203; the
    // header beside it still printed "candle_by_qaaf" to every visitor.
    const layout = readFileSync("src/app/site/[slug]/layout.tsx", "utf8");
    expect(layout).toContain('import { businessDisplayName } from "@/lib/business/displayName"');
    expect(layout).toMatch(/const dealershipName = businessDisplayName\(/);
    expect(layout).not.toMatch(/dealerships\?\.dealership_name \?\? "Business"/);
  });
});
