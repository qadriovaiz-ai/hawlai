// Finding the product an ad is about — from wherever it actually lives.
//
// THE ASSUMPTION THIS CORRECTS: photo resolution searched Shopify and
// only Shopify. But Hawlai HAS its own store — the products table from
// migration 054, rendered at /site/{slug}/products/{id} — and a
// business using it has a real catalogue with real photos that the ad
// path could not see. candle_by_qaaf is exactly that: "Lavender
// candle", ₹550, a real photo, no Shopify connection anywhere.
//
// This is not an edge case. A business that has not connected an
// external store is the DEFAULT state of a new Hawlai account, so the
// only catalogue most merchants have is this one. Searching Shopify
// first and giving up when it is absent meant the common case fell
// through to a generated backdrop.
//
// Same priority-list shape as resolveAdDestination: try each source in
// order, return the first that answers, and be explicit about which
// one did.

import type { ResolvedTarget } from "@/lib/publish/resolve";

export type ProductSource = "shopify" | "hawlai_shop";

export type ProductSearchResult =
  | { ok: true; source: ProductSource; candidates: ResolvedTarget[] }
  | { ok: false; reason: string };

/** Public URL of a product in Hawlai's own storefront. */
export function hawlaiProductUrl(slug: string, productId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hawlai.online";
  return `${base}/site/${slug}/products/${productId}`;
}

/**
 * First image on a product row.
 *
 * `images` is a jsonb array of URLs (migration 054). Anything that is
 * not a usable string is treated as no image rather than passed on —
 * an empty string reaching the creative builder fails deep inside
 * sharp, where the error says nothing about a missing photo.
 */
export function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const entry of images) {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    // Some rows store {url} objects rather than bare strings.
    if (entry && typeof entry === "object" && typeof (entry as any).url === "string" && (entry as any).url.trim()) {
      return (entry as any).url.trim();
    }
  }
  return null;
}

/**
 * Search Hawlai's own catalogue.
 *
 * Returns the SAME ResolvedTarget shape as searchShopifyVariants, so
 * interpretCandidates — which never guesses — governs both sources
 * identically. A second resolution rule for the second source is how
 * the two would drift on which product an ambiguous phrase means.
 */
export async function searchHawlaiProducts(
  supabase: any,
  dealershipId: string,
  phrase: string,
  limit = 10
): Promise<ProductSearchResult> {
  const cleaned = phrase.trim();
  if (!cleaned) return { ok: false, reason: "No product name was given." };

  const { data: site } = await supabase
    .from("websites")
    .select("slug")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  const { data: rows, error } = await supabase
    .from("products")
    .select("id, name, price, images, is_active")
    .eq("dealership_id", dealershipId)
    .ilike("name", `%${cleaned.replace(/[%_]/g, "")}%`)
    .limit(limit);

  if (error) return { ok: false, reason: "Couldn't read your product list." };

  const candidates: ResolvedTarget[] = (rows ?? []).map((p: any) => ({
    ref: p.id,
    title: p.name,
    variantTitle: null,
    currentPrice: p.price != null ? String(p.price) : null,
    // Hawlai's own storefront prices in INR — orderPricing and the
    // checkout both assume it. Stated rather than left null so the
    // candidate list can show a currency like the Shopify one does.
    currency: "INR",
    imageUrl: firstImage(p.images),
    // Null when the business has no published storefront: the product
    // is real but has no page to send anyone to, and the destination
    // resolver has to see that rather than build a URL to nowhere.
    productUrl: site?.slug ? hawlaiProductUrl(site.slug, p.id) : null,
    active: p.is_active !== false,
  }));

  return { ok: true, source: "hawlai_shop", candidates };
}

/**
 * Try every catalogue this business has, in priority order.
 *
 * Shopify first when connected — a merchant who has connected an
 * external store is telling you that is where their catalogue lives.
 * Hawlai's own shop next, which for most accounts is the ONLY
 * catalogue. A source that returns nothing falls through rather than
 * ending the search: having a Shopify connection does not mean every
 * product is in it.
 */
export async function searchAllProductSources(input: {
  supabase: any;
  dealershipId: string;
  phrase: string;
  shopify?: { shop: string; accessToken: string } | null;
  searchShopify?: (shop: string, token: string, phrase: string) => Promise<{ ok: true; candidates: ResolvedTarget[] } | { ok: false; reason: string }>;
}): Promise<ProductSearchResult> {
  const { supabase, dealershipId, phrase, shopify, searchShopify } = input;

  if (shopify && searchShopify) {
    const found = await searchShopify(shopify.shop, shopify.accessToken, phrase);
    if (found.ok && found.candidates.length > 0) {
      return { ok: true, source: "shopify", candidates: found.candidates };
    }
    // A Shopify error is NOT fatal here. The business may still have
    // the product in Hawlai's own shop, and refusing because one
    // catalogue was unreachable would be worse than checking the other.
  }

  return searchHawlaiProducts(supabase, dealershipId, phrase);
}
