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

// See src/app/site/[slug]/page.tsx for why — same stale-cache risk on
// the same public storefront content.
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string; page: string }> }): Promise<Metadata> {
  const { slug, page } = await params;
  return buildPageMetadata(slug, page);
}

export default async function SiteSubPage({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page: pageSlug } = await params;
  const supabase = createServiceClient();

  const { data: website } = await supabase.from("websites").select("id, slug, theme_key, published, dealership_id").eq("slug", slug).maybeSingle();
  if (!website || !website.published) notFound();

  // A DRAFT PAGE IS NOT FOUND (G3a, migration 223).
  //
  // The site's own `published` flag is checked above, and until this
  // column existed that was the only check there was: every page of a
  // published site was reachable the moment its row existed, so Add Page
  // put an empty page at a real URL. `published` defaults to true, so
  // every page that was live before the migration stays live.
  const { data: page } = await supabase
    .from("website_pages")
    .select("sections, published")
    .eq("website_id", website.id)
    .eq("slug", pageSlug)
    .maybeSingle();
  if (!page || page.published === false) notFound();

  const sections = page.sections ?? [];
  const blocks = legacyToBlocks(sections);
  const needsProducts = blockTreeContainsType(blocks, "product_grid");
  const products = needsProducts ? await loadStorefrontItems(supabase, website.dealership_id) : [];

  // STRUCTURED DATA ON THIS PAGE TOO (A2 of docs/PLAN-AEO-GEO.md).
  //
  // Only the home page emitted any, so a hand-written or generated FAQ
  // page — the single most quotable page a small business can have —
  // carried none at all. The business node and this page's own
  // question-and-answer pairs, nothing else: `products` is passed only
  // when a block on the page shows them, and an ItemList on the About
  // page would be describing a catalogue the page does not display.
  const identity = (await loadSiteIdentity(supabase, { dealershipId: website.dealership_id, slug }))?.identity ?? null;
  const jsonLd = identity ? storefrontJsonLd(identity, needsProducts ? products : [], faqPairsFromBlocks(blocks)) : null;

  return (
    <>
      <StructuredData node={jsonLd} />
      <SectionRenderer sections={sections} theme={getTheme(website.theme_key)} slug={slug} products={products} />
    </>
  );
}
