// Everything of this business that is public right now.
//
// WHY THIS EXISTS. Three separate tables each carry their own
// `published` flag, and each one puts a different page on the open
// internet under the owner's name:
//
//   websites.published       /site/<slug>        the Website Builder site
//   landing_pages.published  /p/<slug>           quick-launch pages
//   seo_pages.published      /seo/<slug>         search pages
//
// The Website Builder's toggle says "Site: /site/<slug>", which is
// honest about what it controls — and nothing anywhere tells him about
// the other two. So an owner can switch his site off, reasonably
// believe his business is no longer public, and still have pages with
// his name and his claims on them being served and indexed.
//
// ─────────────────────────────────────────────────────────────────────
// IT REPORTS. IT DOES NOT TAKE ANYTHING DOWN
// ─────────────────────────────────────────────────────────────────────
//
// The tempting fix is to make one switch unpublish all three. That is
// the wrong one: a landing page is usually the destination of an ad
// the owner is paying for, and quietly taking it down while his money
// keeps buying clicks to a dead link is a worse failure than the one
// being fixed. He asked for the site to be off; the site is off. What
// he is owed is the rest of the truth, not a decision made for him.
//
// A FAILED READ IS NOT AN EMPTY ANSWER. Each table is read on its own,
// and one that cannot be read is reported as unknown rather than as
// nothing — "you have no landing pages" and "I could not check your
// landing pages" are different sentences, and only one of them is safe
// to act on.

export type SurfaceCount = {
  /** How many are live. Null when the table could not be read. */
  live: number | null;
  /** A few addresses, for the owner to open and look at. */
  examples: string[];
};

export type PublicSurfaces = {
  site: { live: boolean | null; url: string | null };
  landingPages: SurfaceCount;
  seoPages: SurfaceCount;
};

/** How many addresses are worth showing before it becomes a list. */
export const EXAMPLES_SHOWN = 3;

export async function readPublicSurfaces(supabase: any, dealershipId: string): Promise<PublicSurfaces> {
  const [site, landing, seo] = await Promise.all([
    supabase.from("websites").select("slug, published").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("landing_pages").select("slug").eq("dealership_id", dealershipId).eq("published", true),
    supabase.from("seo_pages").select("slug").eq("dealership_id", dealershipId).eq("published", true),
  ]);

  const count = (res: any, prefix: string): SurfaceCount => {
    if (res?.error || !Array.isArray(res?.data)) return { live: null, examples: [] };
    return {
      live: res.data.length,
      examples: res.data
        .slice(0, EXAMPLES_SHOWN)
        .map((r: any) => `${prefix}/${String(r?.slug ?? "").trim()}`)
        .filter((u: string) => !u.endsWith("/")),
    };
  };

  return {
    site: site?.error
      ? { live: null, url: null }
      : {
          live: site?.data ? site.data.published === true : false,
          url: site?.data?.slug ? `/site/${site.data.slug}` : null,
        },
    landingPages: count(landing, "/p"),
    seoPages: count(seo, "/seo"),
  };
}

/**
 * What to tell the owner about everything that is NOT the main site.
 *
 * NULL WHEN THERE IS NOTHING TO SAY, so the card stays quiet for the
 * businesses — most of them — that have only a site. A line that
 * appears always is a line nobody reads.
 *
 * SAID IN BOTH DIRECTIONS. When the site is off this is the sentence
 * that stops him believing he is offline; when it is on, it is simply
 * the rest of what is live. The same fact either way, which is why it
 * is not phrased as a warning.
 */
export function otherSurfacesLine(surfaces: PublicSurfaces): string | null {
  const parts: string[] = [];
  const say = (n: number | null, one: string, many: string) => {
    if (n === null) return null;
    if (n === 0) return null;
    return `${n} ${n === 1 ? one : many}`;
  };

  const l = say(surfaces.landingPages.live, "landing page", "landing pages");
  const s = say(surfaces.seoPages.live, "search page", "search pages");
  if (l) parts.push(l);
  if (s) parts.push(s);

  // COULD-NOT-CHECK IS ITS OWN SENTENCE, never folded into the count.
  const unknown: string[] = [];
  if (surfaces.landingPages.live === null) unknown.push("landing pages");
  if (surfaces.seoPages.live === null) unknown.push("search pages");

  if (!parts.length && !unknown.length) return null;

  const lines: string[] = [];
  if (parts.length) lines.push(`Also public: ${parts.join(" and ")}.`);
  if (unknown.length) lines.push(`Couldn't check your ${unknown.join(" or ")} just now.`);
  return lines.join(" ");
}
