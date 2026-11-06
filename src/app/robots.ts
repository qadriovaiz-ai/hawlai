import type { MetadataRoute } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { siteBase } from "@/lib/claims/businessFacts";
import { ANSWER_ENGINE_CRAWLERS, PRIVATE_PATHS, optedOutSlugs } from "@/lib/seo/crawlers";

// /robots.txt — A1 of docs/PLAN-AEO-GEO.md.
//
// BEFORE THIS THERE WAS NO robots.txt AT ALL, which means every crawler
// was already allowed. This does not open anything; it writes the
// permission down and points at a sitemap that did not exist either.
//
// THE SERVICE CLIENT, like the storefront route beside it: `websites`
// has owner-scoped RLS and no public select policy, so an anonymous
// read returns nothing. This route is public and reads only published
// slugs, which are already public by being served.
//
// AND IT MUST NEVER FAIL CLOSED. A crawler that gets an error or a
// redirect here reads it as "no instructions" and carries on — which is
// today's behaviour — but a 500 on every fetch is a signal nobody sees.
// So the opt-out read returns an empty list on any failure and this
// route always answers.

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = siteBase().replace(/\/+$/, "");
  const service = createServiceClient();
  const optedOut = await optedOutSlugs(service);
  const hidden = optedOut.map((slug) => `/site/${slug}`);

  return {
    rules: [
      // Everybody: the public half of the site, and not the private
      // half. None of /dashboard, /api or /auth is reachable without a
      // session anyway; this just stops crawlers spending time on them.
      { userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] },

      // THE ANSWER ENGINES, NAMED AND ALLOWED IN WRITING. One rule per
      // crawler rather than a group, so an opt-out or a future
      // restriction is a one-line change against one name.
      ...ANSWER_ENGINE_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        // A business that has asked not to be read by answer engines is
        // excluded HERE and not from the `*` rule — it is still in
        // Google's blue links and in Maps, which is the whole point of
        // the distinction.
        disallow: [...PRIVATE_PATHS, ...hidden],
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
