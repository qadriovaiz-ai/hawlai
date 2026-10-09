// Making the whole site public, or taking it back.
//
// G-3 STEP 2a. A straight extraction out of
// src/app/api/website-builder/publish/route.ts with NO behaviour change
// — same check, same message, same return. It exists so the approvals
// route can flip the flag server-side rather than calling this app over
// HTTP, which gets a Vercel 508 after about four hops.
//
// THERE IS NO PER-PAGE PUBLISH. `websites.published` is one flag for the
// whole site, which is why the chat card's confirm says "your ENTIRE
// live site — every page, not just this one".

export type PublishSiteResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Flip the flag, refusing while any page still holds placeholder text.
 *
 * The placeholder check runs only when PUBLISHING. Unpublishing has to
 * stay unconditional: the safe direction must never be the blocked one,
 * and a site that is already public with broken pages is exactly the
 * case where the owner most needs the switch to work.
 */
export async function setSitePublished(
  supabase: any,
  dealershipId: string,
  published: boolean
): Promise<PublishSiteResult> {
  // Last line of defence before anything goes public: refuse to publish
  // while any page still holds fallback placeholder content, regardless
  // of how it got that way. saveGeneratedWebsite already protects
  // existing real content from being overwritten by a failed
  // regeneration; this catches the other failure mode — a brand-new site
  // whose first generation partly failed and whose owner didn't notice
  // before hitting Publish.
  if (published) {
    const { data: website } = await supabase.from("websites").select("id").eq("dealership_id", dealershipId).maybeSingle();
    if (website) {
      const { data: fallbackPages } = await supabase
        .from("website_pages")
        .select("title")
        .eq("website_id", website.id)
        .eq("is_fallback", true);
      if (fallbackPages && fallbackPages.length > 0) {
        return {
          ok: false,
          status: 400,
          error: `Can't publish — ${fallbackPages.map((p: any) => p.title).join(", ")} still ${
            fallbackPages.length > 1 ? "have" : "has"
          } placeholder content because generation failed. Hit Regenerate Website first.`,
        };
      }
    }
  }

  const { error } = await supabase.from("websites").update({ published: !!published }).eq("dealership_id", dealershipId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
