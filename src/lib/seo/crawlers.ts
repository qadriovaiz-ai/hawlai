// WHAT THE ANSWER ENGINES ARE TOLD, AND WHERE THEY ARE TOLD TO LOOK.
//
// A1 of docs/PLAN-AEO-GEO.md. Measured before it was written: this
// repository had NO robots.txt and NO sitemap of any kind — not a
// restrictive one, none at all. So every crawler was already allowed,
// by absence, and no new storefront could be found except by following
// a link from somewhere there wasn't one.
//
// THREE THINGS THIS CHANGES, and only the second is a behaviour change:
//
//   1. The permission is now IN WRITING. GPTBot, PerplexityBot,
//      ClaudeBot, CCBot and Google-Extended are named and allowed, so
//      the intention is on record and a future accident is visible in a
//      diff. Nothing is newly permitted.
//   2. There is a sitemap, and robots.txt points at it. This is the one
//      that does something: a storefront nobody links to is now
//      discoverable.
//   3. The private half of the app is disallowed — /dashboard, /api,
//      /auth. Not a security measure (those are session-gated and the
//      middleware refuses them anyway); just not worth a crawler's
//      budget or a search result.
//
// GENERATED ROUTES RATHER THAN STATIC FILES, and that was the founder's
// decision 1 of 6 November. Every storefront is a PATH on one shared
// domain, so a single static robots.txt governs every business on the
// platform and cannot say "this one does not want its copy used for AI
// training". A route can. Everyone is defaulted IN; the opt-out reads a
// column that does not exist yet and will start working the day it
// does, with no code change — the same shape autonomyLevelsStore uses
// for a table a deploy has not caught up with.

/**
 * The crawlers that read pages to answer questions.
 *
 * NAMED INDIVIDUALLY, not matched by a pattern, because each one is a
 * statement: this business's own public copy may be read to answer a
 * question about it. A wildcard would say the same thing by accident.
 *
 * `Google-Extended` is not a crawler at all — it is the token that
 * controls whether Google may use already-crawled content for Gemini
 * and AI Overview grounding. It is opt-OUT only, so naming it here
 * changes nothing today; it is the line somebody would edit to opt out,
 * and it should be visible rather than absent.
 */
export const ANSWER_ENGINE_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-Web",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
] as const;

/** Paths no crawler should spend its budget on. None of these are public. */
export const PRIVATE_PATHS = ["/dashboard", "/api/", "/auth/", "/admin-seed-knowledge"] as const;

/** How many storefront URLs one sitemap will list. */
export const SITEMAP_MAX_URLS = 5000;

export type StorefrontPage = { slug: string; pageSlug: string | null; updatedAt: string | null };

/**
 * The storefronts that have asked not to be read by answer engines.
 *
 * NOTHING HAS ASKED YET, and no column holds the answer — the founder's
 * decision was to build the route and add the flag when somebody wants
 * it. This reads `dealerships.ai_crawl_opt_out` and returns an empty
 * list when that column does not exist, so the day it is added the
 * route starts honouring it without being touched.
 *
 * AN UNREADABLE ANSWER MEANS NOBODY OPTED OUT, which is the only
 * direction that can be wrong in a recoverable way: a business whose
 * opt-out was missed is a bug to fix, and a business wrongly hidden
 * from every search engine is a business losing customers silently.
 * Said out loud either way.
 */
export async function optedOutSlugs(service: any): Promise<string[]> {
  try {
    const { data, error } = await service
      .from("websites")
      .select("slug, dealerships!inner(ai_crawl_opt_out)")
      .eq("published", true)
      .eq("dealerships.ai_crawl_opt_out", true);
    if (error) {
      // Expected until the column exists. Logged at a level nobody
      // pages for, because it is the normal state today.
      console.log(`[seo] no AI opt-out column yet, so nothing is excluded from robots.txt: ${error.message}`);
      return [];
    }
    return (Array.isArray(data) ? data : []).map((r: any) => String(r?.slug ?? "")).filter(Boolean);
  } catch (err: any) {
    console.error(`[seo] could not read AI crawl opt-outs, so nothing was excluded: ${err?.message ?? err}`);
    return [];
  }
}

/**
 * Every published storefront page, for the sitemap.
 *
 * PUBLISHED ONLY. An unpublished site is a draft the owner has not
 * shown anyone, and putting it in a sitemap would publish it on his
 * behalf — which is the kind of thing this product must never do by
 * accident.
 *
 * NULL ON A FAILED READ, not an empty list. An empty sitemap and a
 * broken one look identical to a crawler, and the caller should be able
 * to say which happened.
 */
export async function publishedPages(service: any): Promise<StorefrontPage[] | null> {
  const { data: sites, error } = await service
    .from("websites")
    .select("id, slug, updated_at")
    .eq("published", true)
    .limit(SITEMAP_MAX_URLS);
  if (error || !Array.isArray(sites)) {
    console.error(`[seo] could not read published sites for the sitemap: ${error?.message ?? "no rows"}`);
    return null;
  }

  const out: StorefrontPage[] = [];
  for (const site of sites as any[]) {
    const slug = String(site?.slug ?? "").trim();
    if (!slug) continue;
    out.push({ slug, pageSlug: null, updatedAt: site?.updated_at ?? null });
  }

  const ids = (sites as any[]).map((s) => s.id).filter(Boolean);
  if (!ids.length) return out;

  const { data: pages, error: pageError } = await service
    .from("website_pages")
    .select("website_id, slug, updated_at")
    .in("website_id", ids);
  if (pageError) {
    // The home pages are still worth listing. Said, not swallowed.
    console.error(`[seo] could not read inner pages for the sitemap, so only home pages are listed: ${pageError.message}`);
    return out;
  }

  const slugById = new Map((sites as any[]).map((s) => [String(s.id), String(s.slug ?? "")]));
  for (const page of Array.isArray(pages) ? pages : []) {
    const siteSlug = slugById.get(String((page as any).website_id)) ?? "";
    const pageSlug = String((page as any).slug ?? "").trim();
    // The home page is already listed as the site root; listing it
    // again at /site/{slug}/home would be two URLs for one page.
    if (!siteSlug || !pageSlug || pageSlug === "home") continue;
    out.push({ slug: siteSlug, pageSlug, updatedAt: (page as any).updated_at ?? null });
  }
  return out.slice(0, SITEMAP_MAX_URLS);
}

/** The URL a storefront page is served at. One place, so it cannot drift. */
export function storefrontUrl(base: string, page: StorefrontPage): string {
  const root = `${base.replace(/\/+$/, "")}/site/${page.slug}`;
  return page.pageSlug ? `${root}/${page.pageSlug}` : root;
}

/**
 * The body of llms.txt.
 *
 * AN EMERGING PROPOSAL, NOT A STANDARD, and the file says so in its own
 * first lines. No major answer engine has committed to reading it; the
 * crawlers that certainly matter read pages. It is here because
 * everything in it is already in the database and it cost thirty lines
 * beside the two routes that do matter — and because a file that
 * states what this domain is, in plain words, is the cheapest possible
 * version of being understood.
 *
 * NOTHING IN THIS PRODUCT CLAIMS IT HELPS. Nothing measures whether it
 * does, and a number this product cannot trace is a number it does not
 * show.
 */
export function llmsTxt(base: string, sites: { slug: string; name: string; city: string | null; category: string | null }[]): string {
  const lines = [
    "# Hawlai",
    "",
    "> Hawlai hosts websites and online shops for small and medium businesses in India.",
    "> Each business below has its own storefront on this domain. The pages are written",
    "> from each business's own records; anything a business could not substantiate is",
    "> removed before publication.",
    "",
    "This file follows the llms.txt proposal (llmstxt.org). That proposal is not a",
    "standard and no answer engine has committed to reading it. The pages themselves,",
    "and /sitemap.xml, are the authoritative description of this domain.",
    "",
    "## Businesses",
    "",
  ];
  for (const site of sites) {
    const where = site.city ? `, ${site.city}` : "";
    const what = site.category ? ` — ${site.category}` : "";
    lines.push(`- [${site.name}${where}](${base.replace(/\/+$/, "")}/site/${site.slug})${what}`);
  }
  if (!sites.length) lines.push("_No published storefronts yet._");
  lines.push("", "## More", "", `- [Sitemap](${base.replace(/\/+$/, "")}/sitemap.xml)`, "");
  return lines.join("\n");
}
