import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { siteBase } from "@/lib/claims/businessFacts";
import { publishedPages, storefrontUrl } from "@/lib/seo/crawlers";

// /sitemap.xml — A1 of docs/PLAN-AEO-GEO.md, and the half of A1 that
// actually changes something.
//
// THERE WAS NO SITEMAP OF ANY KIND. A storefront at
// hawlai.online/site/{slug} could be found only by following a link
// from somewhere, and for a new business there is nowhere to follow
// from — which is a large part of why candle_by_qaaf does not appear
// for "soy candle in Shahjahanpur".
//
// PUBLISHED ONLY. An unpublished site is a draft the owner has not
// shown anyone; listing it would publish it on his behalf.
//
// AND THE MARKETING HOME IS IN IT TOO, because it is the one page on
// this domain that is not a storefront and is meant to be found.

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBase().replace(/\/+$/, "");
  const home: MetadataRoute.Sitemap = [{ url: `${base}/`, changeFrequency: "weekly", priority: 1 }];

  const pages = await publishedPages(createServiceClient());
  // NULL IS A FAILED READ, NOT AN EMPTY PLATFORM. Returning just the
  // home page says "this domain has one page", which is a claim; it is
  // the least wrong thing available, and the read already logged why.
  if (!pages) return home;

  return [
    ...home,
    ...pages.map((page) => ({
      url: storefrontUrl(base, page),
      // The owner's own last edit, when it is readable. No invented
      // date: a crawler reading a made-up lastModified learns to
      // distrust all of them.
      lastModified: page.updatedAt ? new Date(page.updatedAt) : undefined,
      changeFrequency: "weekly" as const,
      // A storefront's home page above its inner pages, and both below
      // the marketing home. Nothing here is a claim about importance to
      // a customer — it is a crawl-order hint and nothing more.
      priority: page.pageSlug ? 0.6 : 0.8,
    })),
  ];
}
