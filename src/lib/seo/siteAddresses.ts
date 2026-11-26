// Every address this business's site lives at, for matching it to a
// Search Console property.
//
// FOUND 27 NOVEMBER 2026, WHILE WIDENING THE SCOPE FOR OWN-DOMAIN
// BUSINESSES: the connect callback matched properties against ONE
// address — the Hawlai storefront, hawlai.online/site/{slug}. A Shopify
// merchant or a WordPress site has its own domain and usually no Hawlai
// storefront at all, so it connected and was told "none of your
// properties matches this business's site". Searches were never read and
// no sitemap could ever be submitted. Widening the scope alone would
// have changed nothing for exactly the businesses it was widened for.
//
// SPECIFIC ADDRESSES ONLY, NEVER "THE FIRST PROPERTY". matchProperty's
// rule stands: an agency account can hold a dozen clients' properties,
// and reading the wrong one is a privacy failure. Each address here is
// one this business itself connected to Hawlai.
//
// IN ORDER, and the order matters only when a business has more than
// one: the first address that matches a property wins.

import { siteBase } from "@/lib/claims/businessFacts";
import { matchProperty, type SiteProperty } from "@/lib/seo/searchConsole";

/** A bare host or a URL, as https, so hostOf can read it. */
function asUrl(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

/**
 * The Shopify store's PRIMARY domain — the one customers see.
 *
 * `shopify_store_url` holds the *.myshopify.com address, which is what
 * the API is called on and almost never what a merchant verified in
 * Search Console. Shopify knows the real one. Best effort: a store that
 * cannot be asked still has its myshopify address as a fallback.
 */
async function shopifyPrimaryDomain(dealershipId: string): Promise<string | null> {
  try {
    const { resolveShopifyCredentials } = await import("@/lib/publish/platforms/shopifyCredentials");
    const { shopifyGraphQL } = await import("@/lib/commerce/shopifyGraphQL");
    const creds = await resolveShopifyCredentials(dealershipId);
    if (!creds.ok) return null;
    const res = await shopifyGraphQL<{ shop: { primaryDomain: { url: string } | null } }>(
      creds.shop,
      creds.accessToken,
      "{ shop { primaryDomain { url } } }"
    );
    return res.ok ? asUrl(res.data?.shop?.primaryDomain?.url) : null;
  } catch {
    return null;
  }
}

/** Every address this business's site is known by, most specific first. */
export async function businessSiteAddresses(service: any, dealershipId: string): Promise<string[]> {
  const addresses: string[] = [];

  const { data: website } = await service
    .from("websites")
    .select("slug, custom_domain, custom_domain_status")
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  // A Hawlai site on its own domain is that domain; on the platform it
  // is its /site/ path.
  if (website?.custom_domain && website?.custom_domain_status === "connected") {
    const own = asUrl(website.custom_domain);
    if (own) addresses.push(own);
  }
  if (website?.slug) addresses.push(`${siteBase().replace(/\/+$/, "")}/site/${website.slug}`);

  const { data: dealership } = await service
    .from("dealerships")
    .select("wordpress_site_url, shopify_store_url")
    .eq("id", dealershipId)
    .maybeSingle();
  const wordpress = asUrl(dealership?.wordpress_site_url);
  if (wordpress) addresses.push(wordpress);
  if (dealership?.shopify_store_url) {
    const primary = await shopifyPrimaryDomain(dealershipId);
    if (primary) addresses.push(primary);
    const myshopify = asUrl(dealership.shopify_store_url);
    if (myshopify) addresses.push(myshopify);
  }

  return [...new Set(addresses)];
}

/** The property for the first address that has one, or null. */
export function matchFirstProperty(sites: SiteProperty[], addresses: string[]): string | null {
  for (const address of addresses) {
    const match = matchProperty(sites, address);
    if (match) return match;
  }
  return null;
}
