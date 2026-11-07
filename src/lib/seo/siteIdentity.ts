// Who this storefront says it is, read once, for every page that has to
// describe itself to a machine.
//
// A2 of docs/PLAN-AEO-GEO.md. The home page built this identity inline:
// three reads (dealerships, brand_profiles, brand_kits) and a display
// name, twenty lines before the JSON-LD call. The inner page and the
// product page emitted no structured data at all, and the way to give
// them some was to paste those twenty lines twice.
//
// WHY A FUNCTION AND NOT A COPY: a product described with one business
// name on the home page and another on its own page is a machine-
// readable disagreement about who sells it. There is one reader here, so
// there is one answer.
//
// NOT A ROUTE. See CLAUDE.md: a route that fetches its own app gets a
// Vercel 508 after about four hops. This is the logic, extracted and
// called.

import { businessDisplayName } from "@/lib/business/displayName";
import { bookingPageUrl } from "@/lib/catalog/catalogItem";
import { siteBase } from "@/lib/claims/businessFacts";
import type { SiteIdentity } from "./structuredData";
import { readListingFacts } from "./listingFacts";

export type LoadedIdentity = {
  identity: SiteIdentity;
  /**
   * The raw booking slug, handed back rather than thrown away.
   *
   * `identity.bookingUrl` is absolute (it goes in the graph);
   * `toStorefrontProduct` wants the slug so it can build a relative
   * `book_href`. Returning it is what keeps the product page from
   * reading the dealerships row a second time for one column.
   */
  bookingSlug: string | null;
};

/**
 * The identity for one storefront, or null when there is not enough to
 * say anything true.
 *
 * A business with no name publishes no structured data — the same rule
 * `storefrontJsonLd` applies, held here as well so a caller that forgets
 * to check still cannot publish an empty shell.
 */
export async function loadSiteIdentity(
  supabase: any,
  args: { dealershipId: string; slug: string }
): Promise<LoadedIdentity | null> {
  const { dealershipId, slug } = args;
  if (!dealershipId || !slug) return null;

  // The description lives on the profile, the logo on the brand kit, the
  // listing facts on their own table (migration 221) — four tables, as
  // everywhere else that reads them, in one round trip.
  //
  // THE LISTING READ CANNOT FAIL THE PAGE. A business that has not
  // answered the interview has no row at all, and that is the normal
  // case rather than an error: readListingFacts turns a missing row into
  // "the city and nothing else", which is what this node said for every
  // business before 221 existed.
  const [{ data: dealership }, { data: brand }, { data: kit }, { data: listingRow }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category, city, booking_slug, google_place_id, fb_page_id").eq("id", dealershipId).maybeSingle(),
    supabase.from("brand_profiles").select("business_description").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("brand_kits").select("logo_url").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("business_listing_facts").select("*").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  // AN EMPTY FALLBACK, ON PURPOSE.
  //
  // `businessDisplayName` returns "the business" when the name is
  // missing or is still the signup placeholder. The home page called it
  // with that default, so a business that had not yet typed its name
  // was publishing `LocalBusiness { name: "the business" }` to every
  // machine that read its storefront — a placeholder, stated as a fact,
  // in the one format built to be believed without being read. Asking
  // for an empty fallback turns that into no structured data at all,
  // which is this file's rule everywhere else (see structuredData.ts).
  const name = businessDisplayName(dealership?.dealership_name, "");
  if (!name.trim()) return null;

  const base = siteBase().replace(/\/+$/, "");
  // THE STOREFRONT ROOT, on every page, and not the page's own URL.
  //
  // `siteUrl` is the business's address and the stem every product URL
  // is built from (`itemNode`: `${siteUrl}/products/${id}`). Setting it
  // to the page being rendered would make `LocalBusiness.url` point at
  // the About page and, worse, would turn an inner page's product links
  // into `/site/slug/about/products/x` — a machine-readable 404. The
  // page's own address is already in the browser; the graph needs the
  // business's.

  return {
    identity: {
      businessName: name,
      city: dealership?.city ?? null,
      category: dealership?.business_category ?? null,
      description: brand?.business_description ?? null,
      siteUrl: `${base}/site/${slug}`,
      logoUrl: kit?.logo_url ?? null,
      bookingUrl: bookingPageUrl(dealership?.booking_slug, siteBase()),
      // The Maps listing and the Facebook page are DERIVED from the ids
      // already on the dealerships row rather than stored again — two
      // spellings of one fact is how they come to disagree.
      listing: readListingFacts(listingRow, {
        googlePlaceId: dealership?.google_place_id ?? null,
        facebookPageId: dealership?.fb_page_id ?? null,
      }),
    },
    bookingSlug: dealership?.booking_slug ?? null,
  };
}
