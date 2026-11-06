import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { getTheme } from "@/lib/landingThemes";
import SectionRenderer from "@/components/website-builder/SectionRenderer";
import { buildPageMetadata } from "@/lib/siteMetadata";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";
import { blockTreeContainsType, faqPairsFromBlocks } from "@/lib/blocks/utils";
import type { Metadata } from "next";
import { loadStorefrontItems } from "@/lib/catalog/storefrontCatalog";
import { storefrontJsonLd } from "@/lib/seo/structuredData";
import { loadSiteIdentity } from "@/lib/seo/siteIdentity";
import StructuredData from "@/components/website/StructuredData";

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
  const blocks = legacyToBlocks(sections);
  // Loaded for the catalogue block as before — and now also for the
  // structured data below, which describes what this business sells. One
  // read either way.
  const products = await loadStorefrontItems(supabase, website.dealership_id);
  const needsProducts = blockTreeContainsType(blocks, "product_grid");

  // What a machine reads off this page (Brain, Phase 1a). Hawlai builds
  // the site, so Hawlai is the only thing that can emit this — the SEO
  // toolkit's "Schema Markup" task has always produced a block with
  // nowhere to paste it.
  //
  // THE IDENTITY READS MOVED (A2): lib/seo/siteIdentity.ts, because the
  // inner page and the product page need the same three reads and the
  // same display name, and a business described two ways on two pages is
  // a machine-readable disagreement about who it is.
  const identity = (await loadSiteIdentity(supabase, { dealershipId: website.dealership_id, slug }))?.identity ?? null;
  // FAQPage, from the pairs this page actually renders — read off the
  // converted tree, so a legacy `faq` section counts without a database
  // write (convertLegacy maps it onto faq_item blocks).
  const jsonLd = identity ? storefrontJsonLd(identity, products, faqPairsFromBlocks(blocks)) : null;

  return (
    <>
      <StructuredData node={jsonLd} />
      <SectionRenderer sections={sections} theme={getTheme(website.theme_key)} slug={slug} products={needsProducts ? products : []} />
    </>
  );
}
