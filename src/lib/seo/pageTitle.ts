// The one place that decides a page's <title>.
//
// Its own module, with no database import, so BOTH the renderer
// (lib/siteMetadata.ts) and the SEO health check (lib/agents/seoAgent.ts)
// can use it. That split is the whole point: the audit used to grade
// website_pages.title, which is the NAVIGATION label and reads "Home" on
// every site the builder has ever generated — so an owner with a perfect
// 55-character search title was told their title was 4 characters long.
// A check that grades a different string from the one the page serves is
// worse than no check.

import { businessDisplayName } from "@/lib/business/displayName";

/**
 * The nav label every generated site starts with, which is not a title.
 *
 * websiteBuilderAgent creates every homepage as `{ slug: "home", title:
 * "Home" }`, and app/site/[slug]/layout.tsx renders that string as the
 * menu item. Reading it as the title tag would put "Home" in the browser
 * tab and the search result of every site in the product.
 */
const DEFAULT_HOME_LABEL = "home";

/**
 * The <title> for one page, in the order an owner would expect.
 *
 * 1. seo_title — what they (or chat, with approval) set deliberately.
 * 2. the page's own title, unless it is the untouched "Home" label.
 * 3. the business's name, formatted — `businessDisplayName` so a signup
 *    handle reads "Candle by Qaaf" and never `candle_by_qaaf`. That name
 *    reaches Google and the WhatsApp link preview; a raw handle there is
 *    the business's brand, spelled wrong, in public.
 */
export function resolvePageTitle(
  pageSlug: string,
  page: { title?: string | null; seo_title?: string | null },
  dealershipName: string | null | undefined
): string {
  const business = businessDisplayName(dealershipName, "Business");
  const seoTitle = String(page.seo_title ?? "").trim();
  if (seoTitle) return seoTitle;

  const pageTitle = String(page.title ?? "").trim();
  if (pageSlug === "home") {
    return pageTitle && pageTitle.toLowerCase() !== DEFAULT_HOME_LABEL ? pageTitle : business;
  }
  return pageTitle ? `${pageTitle} | ${business}` : business;
}
