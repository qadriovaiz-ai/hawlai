import { createServiceClient } from "@/lib/supabase/service";
import { siteBase } from "@/lib/claims/businessFacts";
import { llmsTxt, SITEMAP_MAX_URLS } from "@/lib/seo/crawlers";
import { businessDisplayName } from "@/lib/business/displayName";

// /llms.txt — A1 of docs/PLAN-AEO-GEO.md, and the part of it that
// promises nothing.
//
// THE ASSESSMENT THE FOUNDER ASKED FOR, AND IT IS IN THE PLAN: llms.txt
// is a proposal (llmstxt.org), not a standard, and no major answer
// engine has committed to reading it. The crawlers that certainly
// matter — GPTBot, PerplexityBot, ClaudeBot, Google-Extended — read
// PAGES. So this is written as a BY-PRODUCT of the two routes beside it
// that do matter, because everything in it was already in the database
// and it cost thirty lines.
//
// NOTHING IN THIS PRODUCT CLAIMS IT HELPS. Nothing measures whether it
// does, and the file says so about itself in its own opening lines.
//
// A ROUTE RATHER THAN THE METADATA API because Next has no llms.txt
// convention — there is nothing to hook into, which is itself a fair
// measure of how established the proposal is.

export const dynamic = "force-dynamic";

export async function GET() {
  const base = siteBase();
  const service = createServiceClient();

  // PUBLISHED ONLY, and the same reasoning as the sitemap: an
  // unpublished site is a draft the owner has not shown anyone.
  const { data, error } = await service
    .from("websites")
    .select("slug, dealerships!inner(dealership_name, city, business_category)")
    .eq("published", true)
    .limit(SITEMAP_MAX_URLS);

  if (error) {
    // SAID, AND STILL ANSWERED. A file nobody has committed to reading
    // is not worth a 500 on the domain root; the body says plainly that
    // the list could not be built, rather than showing an empty one
    // that reads as "no businesses here".
    console.error(`[seo] could not list storefronts for llms.txt: ${error.message}`);
    return new Response(
      `${llmsTxt(base, [])}\n_The business list could not be read just now. /sitemap.xml is authoritative._\n`,
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const sites = (Array.isArray(data) ? data : []).map((row: any) => ({
    slug: String(row?.slug ?? ""),
    // The same display name the storefront itself shows, so the two
    // cannot disagree about what a business is called.
    name: businessDisplayName(row?.dealerships?.dealership_name),
    city: row?.dealerships?.city ?? null,
    category: row?.dealerships?.business_category ?? null,
  })).filter((s) => s.slug);

  return new Response(llmsTxt(base, sites), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Cheap to rebuild and rarely read; an hour keeps a crawler from
      // paying for a database read on every fetch.
      "cache-control": "public, max-age=3600",
    },
  });
}
