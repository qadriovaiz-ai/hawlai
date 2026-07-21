import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { getTheme } from "@/lib/landingThemes";
import SectionRenderer from "@/components/website-builder/SectionRenderer";

export default async function SiteHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: website } = await supabase.from("websites").select("id, slug, theme_key, published, dealership_id").eq("slug", slug).maybeSingle();
  if (!website || !website.published) notFound();

  const { data: page } = await supabase.from("website_pages").select("sections").eq("website_id", website.id).eq("slug", "home").maybeSingle();
  if (!page) notFound();

  const sections = page.sections ?? [];
  const needsProducts = sections.some((s: any) => s.type === "product_catalog");
  const products = needsProducts
    ? (await supabase.from("products").select("id, name, description, price, compare_at_price, images, inventory_count").eq("dealership_id", website.dealership_id).eq("is_active", true).order("order_index", { ascending: true })).data ?? []
    : [];

  return <SectionRenderer sections={sections} theme={getTheme(website.theme_key)} slug={slug} products={products} />;
}
