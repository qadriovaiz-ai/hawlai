import { createServiceClient } from "@/lib/supabase/service";
import type { Metadata } from "next";

// Shared by both public storefront routes (site/[slug] for "home" and
// site/[slug]/[page] for everything else) so a dealer's page title/
// description/OG image actually reach Google and WhatsApp/Facebook
// link previews, instead of every page silently inheriting the root
// layout's generic "Hawlai — AI Marketing Operating System" title —
// same bug this already-fixed pattern in app/p/[slug]/page.tsx solved
// for the older single-page landing system.
export async function buildPageMetadata(slug: string, pageSlug: string): Promise<Metadata> {
  const supabase = createServiceClient();
  const { data: website } = await supabase.from("websites").select("id, dealerships(dealership_name)").eq("slug", slug).maybeSingle();
  if (!website) return { title: "Page not found" };

  const { data: page } = await supabase
    .from("website_pages")
    .select("title, meta_description, og_image_url")
    .eq("website_id", website.id)
    .eq("slug", pageSlug)
    .maybeSingle();
  if (!page) return { title: "Page not found" };

  const dealershipName = (website as any).dealerships?.dealership_name ?? "Business";
  const title = pageSlug === "home" ? dealershipName : `${page.title} | ${dealershipName}`;
  const description = page.meta_description || undefined;
  const images = page.og_image_url ? [page.og_image_url] : undefined;

  return {
    title,
    description,
    openGraph: { title, description, images, type: "website" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
