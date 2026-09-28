import { createServiceClient } from "@/lib/supabase/service";
// The title rule itself lives in lib/seo/pageTitle so the SEO health
// check can grade the same string this renders, without importing a
// module that holds the service-role key.
import { resolvePageTitle } from "@/lib/seo/pageTitle";
export { resolvePageTitle };
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

  const columns = "title, seo_title, meta_description, og_image_url";
  const readPage = (select: string) =>
    supabase.from("website_pages").select(select).eq("website_id", website.id).eq("slug", pageSlug).maybeSingle();

  const first = await readPage(columns);
  let page = first.data as { title?: string | null; seo_title?: string | null; meta_description?: string | null; og_image_url?: string | null } | null;
  const error = first.error;
  // Naming a column that does not exist fails the WHOLE query, and this
  // query decides the title of every public page in the product. If
  // migration 203 hasn't been run on this database yet, falling back
  // costs one extra read on one deploy; not falling back would put
  // "Page not found" in the browser tab of every live storefront.
  if (error) page = (await readPage("title, meta_description, og_image_url")).data as typeof page;
  if (!page) return { title: "Page not found" };

  const title = resolvePageTitle(pageSlug, page, (website as any).dealerships?.dealership_name);
  const description = page.meta_description || undefined;
  const images = page.og_image_url ? [page.og_image_url] : undefined;

  return {
    title,
    description,
    openGraph: { title, description, images, type: "website" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
