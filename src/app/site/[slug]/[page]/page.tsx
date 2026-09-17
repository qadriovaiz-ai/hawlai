import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { getTheme } from "@/lib/landingThemes";
import SectionRenderer from "@/components/website-builder/SectionRenderer";
import { buildPageMetadata } from "@/lib/siteMetadata";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";
import { blockTreeContainsType } from "@/lib/blocks/utils";
import type { Metadata } from "next";
import { loadStorefrontItems } from "@/lib/catalog/storefrontCatalog";

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

  const { data: page } = await supabase.from("website_pages").select("sections").eq("website_id", website.id).eq("slug", pageSlug).maybeSingle();
  if (!page) notFound();

  const sections = page.sections ?? [];
  const needsProducts = blockTreeContainsType(legacyToBlocks(sections), "product_grid");
  const products = needsProducts ? await loadStorefrontItems(supabase, website.dealership_id) : [];

  return <SectionRenderer sections={sections} theme={getTheme(website.theme_key)} slug={slug} products={products} />;
}
