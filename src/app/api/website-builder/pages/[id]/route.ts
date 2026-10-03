import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { blocksText } from "@/lib/claims/businessFacts";

/**
 * Whether a save changed any of the words on the page.
 *
 * Compared through blocksText, the same extractor the claims check and
 * the SEO audit read pages with, so "the words" means exactly what it
 * means everywhere else: headings, paragraph text and button labels.
 * Layout, colours, images and order are not words.
 */
function wordsChanged(before: unknown, after: unknown): boolean {
  const words = (blocks: unknown) => {
    const t = blocksText(blocks);
    return JSON.stringify([t.headings, t.paragraphs, t.buttons]);
  };
  return words(before) !== words(after);
}

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

async function ownsPage(supabase: any, pageId: string, dealershipId: string) {
  const { data } = await supabase.from("website_pages").select("id, websites!inner(dealership_id)").eq("id", pageId).maybeSingle();
  return data && (data as any).websites?.dealership_id === dealershipId;
}

/**
 * Where this page is public, read from the page itself.
 *
 * Deliberately NOT taken from the request: the caller asks for a
 * read-back and nothing more. A client-supplied slug would let the check
 * be pointed at a page that does have the text, and report "live" about
 * one that doesn't.
 */
async function publicAddressOf(supabase: any, pageId: string) {
  const { data } = await supabase
    .from("website_pages")
    .select("slug, websites!inner(slug, published)")
    .eq("id", pageId)
    .maybeSingle();
  if (!data) return null;
  const site = (data as any).websites;
  return { pageSlug: String((data as any).slug ?? "home"), siteSlug: String(site?.slug ?? ""), published: Boolean(site?.published) };
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });
  if (!(await ownsPage(supabase, id, dealershipId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: pageRow } = await supabase.from("website_pages").select("website_id").eq("id", id).single();
  const { count } = await supabase.from("website_pages").select("id", { count: "exact", head: true }).eq("website_id", pageRow?.website_id);
  if ((count ?? 0) <= 1) return NextResponse.json({ error: "A site needs at least one page" }, { status: 400 });

  const { error } = await supabase.from("website_pages").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });
  if (!(await ownsPage(supabase, id, dealershipId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // Optimistic concurrency: the block canvas only saves on an explicit
  // "Save Page" click (no autosave), so two tabs editing the same page
  // — or a stale tab left open across a page reload elsewhere — is a
  // real scenario. If the caller tells us the updated_at it last saw,
  // reject a save that would silently clobber a change made since.
  if (body.expectedUpdatedAt !== undefined) {
    const { data: current } = await supabase.from("website_pages").select("updated_at").eq("id", id).single();
    if (current && current.updated_at !== body.expectedUpdatedAt) {
      return NextResponse.json({ error: "This page was changed elsewhere — reload the page and try again" }, { status: 409 });
    }
  }

  const update: any = {};
  if (body.title !== undefined) update.title = body.title;
  // The <title> tag, separate from `title` — which is the navigation
  // label and reads "Home" on every generated homepage (migration 203).
  if (body.seoTitle !== undefined) update.seo_title = body.seoTitle || null;
  if (body.metaDescription !== undefined) update.meta_description = body.metaDescription;
  if (body.ogImageUrl !== undefined) update.og_image_url = body.ogImageUrl || null;
  if (body.sections !== undefined) {
    update.sections = body.sections;
    // ONLY WHEN THE WORDS CHANGED.
    //
    // Website Builder saves the whole page at once — sections, title,
    // meta description, share image — so a "Save Page" after uploading a
    // share image sends the sections too. Flipping on that would record
    // the owner as having stood behind body copy they never read, which
    // is the opposite of what this column is for.
    //
    // Reordering blocks, changing a colour, swapping an image: all of
    // them leave the words alone and none of them flips it.
    const { data: current } = await supabase.from("website_pages").select("sections").eq("id", id).maybeSingle();
    if (wordsChanged(current?.sections, body.sections)) update.content_source = "edited";
  }

  const { data: updated, error } = await supabase.from("website_pages").update(update).eq("id", id).select("updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // READ THE PAGE BACK, when the caller is about to tell someone it's live.
  //
  // Only chat asks for this. Website Builder saves while the owner is
  // looking at the canvas and can see the result for themselves, so
  // spending an outbound request on every keystroke-driven save would buy
  // nothing. Chat's approval card, by contrast, had no way to know: it
  // read a 200 from this route and answered "✅ Updated your live
  // homepage" — the same unfounded claim the meta flow was fixed for.
  //
  // A failed read is never reported as a failed write. The row is saved
  // either way; what's in doubt is only whether the page is serving it.
  const verifyText: string[] = Array.isArray(body.verifyText)
    ? body.verifyText.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  let liveCheck: { verified: boolean; url: string; message: string; missing: string[] } | undefined;
  if (verifyText.length > 0) {
    const address = await publicAddressOf(supabase, id);
    if (!address?.siteSlug) {
      liveCheck = { verified: false, url: "", message: "Saved. I couldn't work out this site's public address, so I haven't confirmed the page is serving it.", missing: verifyText };
    } else if (!address.published) {
      // Not a failure, and not live: there is no public page to read.
      liveCheck = { verified: false, url: "", message: "Saved to your homepage. Your site isn't published yet, so nothing is public — publish it and the new wording goes live.", missing: [] };
    } else {
      const { readLiveText, verifyTextLive } = await import("@/lib/seo/liveText");
      liveCheck = verifyTextLive(verifyText, await readLiveText(address.siteSlug, address.pageSlug));
    }
  }

  return NextResponse.json({ success: true, updatedAt: updated?.updated_at, ...(liveCheck ? { liveCheck } : {}) });
}
