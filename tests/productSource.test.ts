// Finding the product an ad is about, from wherever it actually lives.
//
// THE ASSUMPTION THIS CORRECTS: photo resolution searched Shopify and
// only Shopify. Hawlai has its own store — the products table from
// migration 054, rendered at /site/{slug}/products/{id} — and a
// business using it had a real catalogue with real photos the ad path
// could not see. candle_by_qaaf is exactly that: "Lavender candle",
// ₹550, a real photo, no Shopify connection at all.
//
// Not an edge case. A business with no external store connected is the
// DEFAULT state of a new account, so for most merchants this is the
// only catalogue there is. Searching Shopify and giving up when it was
// absent meant the COMMON case fell through to a generated backdrop.

import { describe, it, expect, vi } from "vitest";
import {
  searchHawlaiProducts,
  searchAllProductSources,
  hawlaiProductUrl,
  firstImage,
} from "@/lib/ads/productSource";

const DEALERSHIP = "d1";

const LAVENDER = {
  id: "prod-1",
  name: "Lavender candle",
  price: 550,
  images: ["https://cdn.hawlai/lavender.jpg"],
  is_active: true,
};

function db(products: any[] = [LAVENDER], slug: string | null = "candle-by-qaaf", productsError = false) {
  return {
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        ilike: () => api,
        limit: async () => (productsError ? { data: null, error: { message: "boom" } } : { data: products, error: null }),
        maybeSingle: async () => ({ data: slug ? { slug } : null }),
      };
      return api;
    },
  };
}

describe("reading a product row", () => {
  it("takes the first image from the jsonb array", () => {
    expect(firstImage(["https://a/1.jpg", "https://a/2.jpg"])).toBe("https://a/1.jpg");
  });

  it("handles rows that store {url} objects instead of bare strings", () => {
    expect(firstImage([{ url: "https://a/1.jpg" }])).toBe("https://a/1.jpg");
  });

  it.each([[[]], [null], [undefined], ["not an array"], [[""]], [["   "]], [[{}]], [[null]]])(
    "treats %s as no image rather than passing something unusable on",
    (images) => {
      // An empty string reaching the creative builder fails deep inside
      // sharp, where the error says nothing about a missing photo.
      expect(firstImage(images as any)).toBeNull();
    }
  );

  it("builds a real storefront URL", () => {
    expect(hawlaiProductUrl("candle-by-qaaf", "prod-1")).toMatch(/\/site\/candle-by-qaaf\/products\/prod-1$/);
  });
});

describe("searching Hawlai's own catalogue", () => {
  it("finds the product, its photo and its page", async () => {
    const r = await searchHawlaiProducts(db(), DEALERSHIP, "lavender");
    expect(r.ok && r.source).toBe("hawlai_shop");
    const c = r.ok ? r.candidates[0] : null;
    expect(c!.title).toBe("Lavender candle");
    expect(c!.imageUrl).toBe("https://cdn.hawlai/lavender.jpg");
    expect(c!.productUrl).toContain("/site/candle-by-qaaf/products/prod-1");
    expect(c!.currentPrice).toBe("550");
  });

  it("returns the SAME shape Shopify returns, so one resolver governs both", async () => {
    // interpretCandidates never guesses. A second resolution rule for
    // the second source is how the two drift on what an ambiguous
    // phrase means — and the losing side of that is which product gets
    // advertised.
    const { interpretCandidates } = await import("@/lib/publish/resolve");
    const r = await searchHawlaiProducts(db([LAVENDER, { ...LAVENDER, id: "prod-2", name: "Lavender candle large" }]), DEALERSHIP, "lavender");
    const outcome = interpretCandidates("lavender", r.ok ? r.candidates : []);
    expect(outcome.status).toBe("ambiguous");
  });

  it("gives a NULL product url when there is no published storefront", async () => {
    // The product is real but has no page to send anyone to. The
    // destination resolver has to see that rather than be handed a URL
    // to nowhere.
    const r = await searchHawlaiProducts(db([LAVENDER], null), DEALERSHIP, "lavender");
    expect(r.ok && r.candidates[0].productUrl).toBeNull();
  });

  it("refuses an empty phrase rather than listing the whole catalogue", async () => {
    expect((await searchHawlaiProducts(db(), DEALERSHIP, "   ")).ok).toBe(false);
  });

  it("reports a read failure instead of claiming there are no products", async () => {
    const r = await searchHawlaiProducts(db([LAVENDER], "s", true), DEALERSHIP, "lavender");
    expect(r.ok).toBe(false);
  });
});

describe("priority across catalogues", () => {
  const shopifyHit = async () => ({
    ok: true as const,
    candidates: [{ ref: "gid://1", title: "Shopify Candle", variantTitle: null, currentPrice: "999", imageUrl: "https://cdn.shopify/x.jpg", productUrl: "https://shop/p/1", active: true }],
  });
  const shopifyEmpty = async () => ({ ok: true as const, candidates: [] });
  const shopifyDown = async () => ({ ok: false as const, reason: "unreachable" });

  it("prefers Shopify when it is connected AND has the product", async () => {
    // Connecting an external store is a merchant telling you that is
    // where their catalogue lives.
    const r = await searchAllProductSources({
      supabase: db(), dealershipId: DEALERSHIP, phrase: "candle",
      shopify: { shop: "s.myshopify.com", accessToken: "t" }, searchShopify: shopifyHit,
    });
    expect(r.ok && r.source).toBe("shopify");
  });

  it("FALLS THROUGH to Hawlai's shop when Shopify has no match", async () => {
    // Having a Shopify connection does not mean every product is in it
    // — which is candle_by_qaaf's situation exactly if they ever
    // connect one.
    const r = await searchAllProductSources({
      supabase: db(), dealershipId: DEALERSHIP, phrase: "lavender",
      shopify: { shop: "s.myshopify.com", accessToken: "t" }, searchShopify: shopifyEmpty,
    });
    expect(r.ok && r.source).toBe("hawlai_shop");
    expect(r.ok && r.candidates[0].title).toBe("Lavender candle");
  });

  it("falls through when Shopify is unreachable, rather than giving up", async () => {
    // One catalogue being down is not a reason to ignore the other.
    const r = await searchAllProductSources({
      supabase: db(), dealershipId: DEALERSHIP, phrase: "lavender",
      shopify: { shop: "s.myshopify.com", accessToken: "t" }, searchShopify: shopifyDown,
    });
    expect(r.ok && r.source).toBe("hawlai_shop");
  });

  it("searches Hawlai's shop when there is NO Shopify connection at all", async () => {
    // THE COMMON CASE, and the one that was broken: no external store,
    // a real catalogue, and previously a generated backdrop.
    const r = await searchAllProductSources({
      supabase: db(), dealershipId: DEALERSHIP, phrase: "lavender", shopify: null,
    });
    expect(r.ok && r.source).toBe("hawlai_shop");
    expect(r.ok && r.candidates[0].imageUrl).toBe("https://cdn.hawlai/lavender.jpg");
  });

  it("does not call Shopify when there is no connection", async () => {
    const spy = vi.fn();
    await searchAllProductSources({
      supabase: db(), dealershipId: DEALERSHIP, phrase: "lavender", shopify: null, searchShopify: spy as any,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
