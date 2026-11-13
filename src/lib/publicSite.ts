// Which business a public slug belongs to — one resolver.
//
// A SLUG CAN BE TWO DIFFERENT THINGS. A quick-launch landing page
// (`landing_pages`, served at /p/<slug>) and a Website Builder site
// (`websites`, served at /site/<slug>) are separate tables in separate
// slug namespaces, and every public, unauthenticated route has to try
// both to find out whose page a visitor is standing on.
//
// WHY THIS FILE EXISTS. Two routes had already written that fallback
// out by hand — /api/public/track and /api/public/leads — and they had
// already drifted into different shapes: one filtered `published` in
// the query, the other read the column back and tested it in
// JavaScript. They happen to agree today. A third copy was about to be
// written for the chat route when the agent moved onto the storefront,
// and in this codebase a duplicated definition has been the cause of a
// bug every time it has been left alone.
//
// UNPUBLISHED IS NOT FOUND. A slug whose landing page exists but is
// unpublished must fall through to `websites` rather than resolving to
// a business whose page nobody is allowed to see — both callers already
// behave that way and a test pins it, because getting it wrong would
// serve a draft page's business to the public.

/** Which table a public slug resolved in. */
export type PublicSiteSource = "landing_page" | "website";

export type PublicSite = {
  dealershipId: string;
  source: PublicSiteSource;
};

/**
 * Resolve a public slug to the business behind it.
 *
 * Null when the slug matches no PUBLISHED page of either kind — which
 * callers treat differently on purpose: tracking fails silently so a
 * broken page is never a broken site, lead capture returns a 404, and
 * the chat route refuses the turn.
 *
 * A LANDING PAGE WINS A TIE. The namespaces are separate, so the same
 * slug can exist in both; landing pages are checked first because that
 * is the order both existing callers already used, and changing which
 * business answers for a slug is not a refactor.
 */
export async function resolvePublicSite(
  supabase: any,
  slug: unknown
): Promise<PublicSite | null> {
  const key = String(slug ?? "").trim();
  if (!key) return null;

  const { data: page } = await supabase
    .from("landing_pages")
    .select("dealership_id")
    .eq("slug", key)
    .eq("published", true)
    .maybeSingle();
  if (page?.dealership_id) return { dealershipId: page.dealership_id, source: "landing_page" };

  const { data: website } = await supabase
    .from("websites")
    .select("dealership_id")
    .eq("slug", key)
    .eq("published", true)
    .maybeSingle();
  if (website?.dealership_id) return { dealershipId: website.dealership_id, source: "website" };

  return null;
}
