// Google Merchant Center and Meta Catalog product feeds.
//
// NOT a verbatim restoration — the original harness was written in an
// earlier session and deleted. Equivalent coverage derived from
// current behaviour, protecting what that harness was written for:
// the two platforms' incompatible availability strings, and XML
// escaping, where one unescaped `&` invalidates the ENTIRE feed rather
// than the one item containing it.

import { describe, it, expect } from "vitest";
import { buildGoogleFeed, buildMetaFeed, isFeedEligible, type FeedProduct, type FeedContext } from "@/lib/ads/productFeed";

const ctx: FeedContext = {
  siteOrigin: "https://shop.example",
  slug: "my-store",
  businessName: "My Store",
};

function product(overrides: Partial<FeedProduct> = {}): FeedProduct {
  return {
    id: "p1",
    name: "Blue Kurta",
    description: "A comfortable cotton kurta",
    price: 1499,
    images: ["https://shop.example/img/1.jpg"],
    inventory_count: 5,
    brand: "Acme",
    condition: "new",
    gtin: null,
    category: "Apparel",
    ...overrides,
  };
}

describe("eligibility", () => {
  it("accepts a complete product", () => {
    expect(isFeedEligible(product())).toBe(true);
  });

  it("rejects a product with no image", () => {
    expect(isFeedEligible(product({ images: [] }))).toBe(false);
    expect(isFeedEligible(product({ images: null }))).toBe(false);
  });

  it("rejects a zero or negative price", () => {
    expect(isFeedEligible(product({ price: 0 }))).toBe(false);
    expect(isFeedEligible(product({ price: -10 }))).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(isFeedEligible(product({ name: "   " }))).toBe(false);
  });

  it("excludes ineligible products from both feeds rather than emitting broken items", () => {
    const items = [product({ id: "ok" }), product({ id: "bad", images: [] })];
    expect(buildGoogleFeed(items, ctx)).not.toContain("bad");
    expect(buildMetaFeed(items, ctx)).not.toContain("bad");
  });
});

describe("Google feed", () => {
  const xml = buildGoogleFeed([product()], ctx);

  it("is RSS 2.0 with the g: namespace declared", () => {
    expect(xml).toContain("<rss");
    expect(xml).toContain("xmlns:g=");
  });

  it("uses the underscore availability string Google requires", () => {
    // Google wants "in_stock". Meta wants "in stock". Sending either
    // platform the other's spelling rejects the whole feed — this is
    // the reason there are two builders rather than one.
    expect(xml).toContain("in_stock");
    expect(xml).not.toContain(">in stock<");
  });

  it("includes the required item fields", () => {
    expect(xml).toContain("<g:id>");
    expect(xml).toContain("<g:price>");
    expect(xml).toContain("<g:image_link>");
    expect(xml).toContain("<g:availability>");
  });

  it("builds absolute product links from the storefront origin", () => {
    expect(xml).toContain("https://shop.example");
    expect(xml).toContain("my-store");
  });

  it("reports out of stock when inventory is zero", () => {
    expect(buildGoogleFeed([product({ inventory_count: 0 })], ctx)).toContain("out_of_stock");
  });

  it("falls back to the business name when a product has no brand", () => {
    expect(buildGoogleFeed([product({ brand: null })], ctx)).toContain("My Store");
  });
});

describe("XML escaping", () => {
  it("escapes ampersands in product names", () => {
    // The failure this prevents is total: one raw & makes the feed
    // unparseable and Google rejects every item in it, not just this
    // one. "Salwar & Kameez" is an entirely ordinary product name.
    const xml = buildGoogleFeed([product({ name: "Salwar & Kameez" })], ctx);
    expect(xml).toContain("&amp;");
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
  });

  it("neutralises tag-shaped content in names rather than emitting it", () => {
    // Asserts the GUARANTEE, not the mechanism. plainText() strips
    // anything tag-shaped before xmlEscape() runs, so "Size <M>"
    // becomes "Size" rather than "Size &lt;M&gt;". Both are safe; the
    // property that matters is that no raw markup reaches the feed.
    //
    // Worth knowing rather than fixing: a product genuinely named
    // "Size <M>" loses the bracketed part. Angle brackets in real
    // product names are rare enough that stripping is the right
    // trade against parsing rich-text descriptions correctly.
    const xml = buildGoogleFeed([product({ name: "Size <M>" })], ctx);
    expect(xml).toContain("<g:title>Size</g:title>");
    expect(xml).not.toContain("<M>");
  });

  it("escapes markup in the description too, not only the name", () => {
    const xml = buildGoogleFeed([product({ description: "100% cotton & soft <b>premium</b>" })], ctx);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    expect(xml).not.toContain("<b>");
  });
});

describe("Meta feed", () => {
  const tsv = buildMetaFeed([product()], ctx);

  it("is tab-separated with a header row", () => {
    const [header] = tsv.split("\n");
    expect(header).toContain("\t");
    expect(header).toContain("id");
  });

  it("uses the SPACE availability string Meta requires", () => {
    expect(tsv).toContain("in stock");
    expect(tsv).not.toContain("in_stock");
  });

  it("emits one row per eligible product plus the header", () => {
    const rows = buildMetaFeed([product({ id: "a" }), product({ id: "b" })], ctx).trim().split("\n");
    expect(rows).toHaveLength(3);
  });

  it("does not leak tabs or newlines from product text into the row structure", () => {
    // A tab inside a product name would shift every later column.
    const rows = buildMetaFeed([product({ name: "Kurta\twith\ttabs", description: "line1\nline2" })], ctx)
      .trim()
      .split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1].split("\t")).toHaveLength(rows[0].split("\t").length);
  });

  it("reports out of stock when inventory is zero", () => {
    expect(buildMetaFeed([product({ inventory_count: 0 })], ctx)).toContain("out of stock");
  });
});

describe("empty input", () => {
  it("produces a valid empty Google feed rather than throwing", () => {
    const xml = buildGoogleFeed([], ctx);
    expect(xml).toContain("<rss");
  });

  it("produces a header-only Meta feed rather than throwing", () => {
    expect(buildMetaFeed([], ctx).trim().split("\n")).toHaveLength(1);
  });
});
