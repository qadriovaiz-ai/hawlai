// WHERE EACH PRODUCT IS SOLD — migration 249, the founder's ask of
// 28 November 2026: Instagram only, Website only, or Both (default).
// An Instagram-only product is not on the website; a Website-only product
// is not offered in Instagram DM selling.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";
import { soldOn, readSalesChannel, isSalesChannel, SALES_CHANNELS } from "@/lib/catalog/salesChannel";
import { resolveOrderPricing, resolveBusinessOrderPricing } from "@/lib/orderPricing";
import { loadStorefrontItems } from "@/lib/catalog/storefrontCatalog";
import { toCatalogProduct } from "@/lib/claims/businessFacts";

const row = (id: string, sales_channel: string | null) => ({ id, name: `Item ${id}`, price: 100, is_active: true, inventory_count: null, kind: "product", sales_channel, images: [], description: null, compare_at_price: null });

function db(products: any[]) {
  return {
    from: (table: string) => {
      const api: any = {
        select: () => api, eq: () => api, in: () => api, order: () => api, limit: () => api,
        maybeSingle: async () => ({ data: table === "websites" ? { id: "w1", dealership_id: "d1", published: true, shipping_mode: "free" } : { booking_slug: null }, error: null }),
        then: (res: any) => res({ data: table === "products" ? products : [], error: null }),
      };
      return api;
    },
  };
}

describe("1. THE RULE", () => {
  it("BOTH IS SOLD EVERYWHERE; EACH 'ONLY' ON ITS OWN CHANNEL", () => {
    expect(soldOn("both", "website")).toBe(true);
    expect(soldOn("both", "instagram")).toBe(true);
    expect(soldOn("website", "website")).toBe(true);
    expect(soldOn("website", "instagram")).toBe(false);
    expect(soldOn("instagram", "instagram")).toBe(true);
    expect(soldOn("instagram", "website")).toBe(false);
  });

  it("A MISSING OR UNKNOWN VALUE READS AS 'both' — nothing disappears because a value couldn't be read", () => {
    expect(readSalesChannel(null)).toBe("both");
    expect(readSalesChannel(undefined)).toBe("both");
    expect(readSalesChannel("tiktok")).toBe("both");
    expect(soldOn(undefined, "instagram")).toBe(true);
  });

  it("BUT A REQUEST MAY SET ONLY THE THREE — a typo is refused, not saved as 'both'", () => {
    expect(isSalesChannel("both") && isSalesChannel("website") && isSalesChannel("instagram")).toBe(true);
    expect(isSalesChannel("Instagram")).toBe(false);
    expect(isSalesChannel("")).toBe(false);
    expect(SALES_CHANNELS.map((c) => c.value)).toEqual(["both", "website", "instagram"]);
  });

  it("THE CATALOGUE CARRIES IT", () => {
    expect(toCatalogProduct({ id: "x", name: "x", sales_channel: "website" }).salesChannel).toBe("website");
    expect(toCatalogProduct({ id: "x", name: "x" }).salesChannel).toBe("both");
  });
});

describe("2. THE WEBSITE", () => {
  it("AN INSTAGRAM-ONLY PRODUCT IS NOT IN THE STORE", async () => {
    const items = await loadStorefrontItems(db([row("a", "both"), row("b", "instagram"), row("c", "website"), row("d", null)]), "d1");
    expect(items.map((i) => i.id)).toEqual(["a", "c", "d"]);
  });

  it("AND CANNOT BE BOUGHT FROM THE CART", async () => {
    const r = await resolveOrderPricing(db([row("b", "instagram")]), "shop", [{ productId: "b", quantity: 1 }]);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("while a Website-only product can", async () => {
    const r = await resolveOrderPricing(db([row("c", "website")]), "shop", [{ productId: "c", quantity: 1 }]);
    expect(r.ok).toBe(true);
  });

  it("ITS PAGE IS NOT FOUND — read with comments stripped", () => {
    expect(code("src/app/site/[slug]/products/[productId]/page.tsx")).toMatch(/if \(!product \|\| !product\.is_active \|\| !soldOn\(product\.sales_channel, "website"\)\) notFound\(\);/);
  });
});

describe("3. INSTAGRAM DM SELLING", () => {
  it("A WEBSITE-ONLY PRODUCT CANNOT BE ORDERED THROUGH A DM — and the reason names it", async () => {
    const r = await resolveBusinessOrderPricing(db([row("c", "website")]), "d1", [{ productId: "c", quantity: 1 }], null, 0);
    expect(r).toMatchObject({ ok: false, status: 400, error: '"Item c" is sold on the website only, not through Instagram' });
  });

  it("while an Instagram-only one can", async () => {
    const r = await resolveBusinessOrderPricing(db([row("b", "instagram")]), "d1", [{ productId: "b", quantity: 1 }], null, 0);
    expect(r.ok).toBe(true);
  });

  it("THE INSTAGRAM REPLY'S CATALOGUE LEAVES IT OUT — and Facebook's is unchanged — read with comments stripped", () => {
    expect(code("src/lib/webhooks/autoReplyHandler.ts")).toMatch(
      /const catalogItems = \(await fetchCatalog\(supabase, dealership\.id\)\)\.filter\(\(p\) => channel !== "instagram" \|\| soldOn\(p\.salesChannel, "instagram"\)\);/
    );
  });
});

describe("4. THE SWITCH", () => {
  const route = code("src/app/api/products/[id]/route.ts");
  const manager = code("src/components/website-builder/ProductManager.tsx");

  it("THE ROUTE SAVES ONLY ONE OF THE THREE", () => {
    expect(route).toMatch(/if \(body\.salesChannel !== undefined\) \{\s*if \(!isSalesChannel\(body\.salesChannel\)\) return NextResponse\.json\(\{ error: [^}]*\}, \{ status: 400 \}\);\s*update\.sales_channel = body\.salesChannel;/);
  });

  it("THE LIST — shown in both Website Builder and Instagram Store — offers it on every row", () => {
    expect(manager).toMatch(/onChange=\{\(e\) => changeSalesChannel\(p, e\.target\.value as SalesChannel\)\}/);
    expect(code("src/components/instagram-store/InstagramStoreView.tsx")).toMatch(/import ProductManager from "@\/components\/website-builder\/ProductManager";/);
  });

  it("A FAILED SAVE PUTS IT BACK AND SAYS SO — never shown as saved", () => {
    const fn = manager.slice(manager.indexOf("async function changeSalesChannel("), manager.indexOf("async function toggleReviews("));
    expect(fn).toMatch(/if \(!res\?\.ok\) \{[\s\S]*sales_channel: before[\s\S]*setError\(/);
  });
});

describe("5. WHAT LINKS TO THE WEBSITE PAGE — an Instagram-only product has none", () => {
  it("SHOPPING FEEDS LEAVE IT OUT — read with comments stripped", () => {
    expect(code("src/app/api/feeds/[platform]/[slug]/route.ts")).toMatch(/const rows = \(products \?\? \[\]\)\.filter\(\(p: any\) => soldOn\(p\.sales_channel, "website"\)\)/);
  });

  it("AN AD GETS NO PAGE TO SEND PEOPLE TO, as for a business with no store", () => {
    expect(code("src/lib/ads/productSource.ts")).toMatch(/productUrl: site\?\.slug && soldOn\(p\.sales_channel, "website"\) \? hawlaiProductUrl\(site\.slug, p\.id\) : null,/);
  });
});
