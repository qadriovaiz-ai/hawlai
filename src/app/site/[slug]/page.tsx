import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { getTheme } from "@/lib/landingThemes";
import SectionRenderer from "@/components/website-builder/SectionRenderer";
import { buildPageMetadata } from "@/lib/siteMetadata";
import { legacyToBlocks } from "@/lib/blocks/convertLegacy";
import { blockTreeContainsType } from "@/lib/blocks/utils";
import type { Metadata } from "next";

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
  const needsProducts = blockTreeContainsType(legacyToBlocks(sections), "product_grid");
  const products = needsProducts
    ? (await supabase.from("products").select("id, name, description, price, compare_at_price, images, inventory_count").eq("dealership_id", website.dealership_id).eq("is_active", true).order("order_index", { ascending: true })).data ?? []
    : [];

  return <SectionRenderer sections={sections} theme={getTheme(website.theme_key)} slug={slug} products={products} />;
}
