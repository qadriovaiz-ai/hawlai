import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { getTheme } from "@/lib/landingThemes";
import SectionRenderer from "@/components/website-builder/SectionRenderer";
import { buildPageMetadata } from "@/lib/siteMetadata";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";
import { blockTreeContainsType } from "@/lib/blocks/utils";
import type { Metadata } from "next";
import { loadStorefrontItems } from "@/lib/catalog/storefrontCatalog";
import { storefrontJsonLd } from "@/lib/seo/structuredData";
import StructuredData from "@/components/website/StructuredData";
import { businessDisplayName } from "@/lib/business/displayName";
import { bookingPageUrl } from "@/lib/catalog/catalogItem";
import { siteBase } from "@/lib/claims/businessFacts";

// Without this, Next.js's default fetch caching can wrap the Supabase
// calls below indefinitely — a real bug found live: a database fix
// (regenerating this page's content) didn't show up on the public
// site because a stale cached render kept being served. This is
// public-facing marketing/storefront content (prices, pages, links) —
// it must always reflect the current database, never a stale cache.
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return buildPageMetadata(slug, "home");
}

export default async function SiteHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: website } = await supabase.from("websites").select("id, slug, theme_key, published, dealership_id").eq("slug", slug).maybeSingle();
  if (!website || !website.published) notFound();

  const { data: page } = await supabase.from("website_pages").select("sections").eq("website_id", website.id).eq("slug", "home").maybeSingle();
  if (!page) notFound();

  const sections = page.sections ?? [];
  // Loaded for the catalogue block as before — and now also for the
  // structured data below, which describes what this business sells. One
  // read either way.
  const products = await loadStorefrontItems(supabase, website.dealership_id);
  const needsProducts = blockTreeContainsType(legacyToBlocks(sections), "product_grid");

  // What a machine reads off this page (Brain, Phase 1a). Hawlai builds
  // the site, so Hawlai is the only thing that can emit this — the SEO
  // toolkit's "Schema Markup" task has always produced a block with
  // nowhere to paste it.
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, business_category, city, booking_slug")
    .eq("id", website.dealership_id)
    .maybeSingle();
  // The description lives on the profile, the logo on the brand kit —
  // two tables, as everywhere else that reads them.
  const [{ data: brand }, { data: kit }] = await Promise.all([
    supabase.from("brand_profiles").select("business_description").eq("dealership_id", website.dealership_id).maybeSingle(),
    supabase.from("brand_kits").select("logo_url").eq("dealership_id", website.dealership_id).maybeSingle(),
  ]);

  const jsonLd = storefrontJsonLd(
    {
      businessName: businessDisplayName(dealership?.dealership_name),
      city: dealership?.city ?? null,
      category: dealership?.business_category ?? null,
      description: brand?.business_description ?? null,
      siteUrl: `${siteBase()}/site/${slug}`,
      logoUrl: kit?.logo_url ?? null,
      bookingUrl: bookingPageUrl(dealership?.booking_slug, siteBase()),
    },
    products
  );

  return (
    <>
      <StructuredData node={jsonLd} />
      <SectionRenderer sections={sections} theme={getTheme(website.theme_key)} slug={slug} products={needsProducts ? products : []} />
    </>
  );
}
