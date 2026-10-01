// The "Claims on your site" review — Stage 2.
//
// GET  lists every line on the live site the business cannot back up.
// POST takes one decision at a time: keep, remove, or finish.
//
// Each decision is the owner's. Keep writes the claim into Business
// Knowledge, which makes THEM the source for it rather than the page
// that happened to say it first — and the line stops being flagged
// because it is now genuinely backed. Remove takes that one sentence out
// of that one block. Finish records that they have been through the
// list, which is what switches on the rule that machine-written copy no
// longer counts as evidence for this business.
//
// Nothing is deleted or rewritten except by a decision sent from here.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { reviewPage, factsWithoutGeneratedCopy, withoutSentence } from "@/lib/claims/siteClaimsReview";

async function who(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return { error: NextResponse.json({ error: "No dealership" }, { status: 400 }) };
  return { dealershipId: profile.dealership_id as string };
}

async function livePages(supabase: any, dealershipId: string) {
  const { data: website } = await supabase.from("websites").select("id").eq("dealership_id", dealershipId).maybeSingle();
  if (!website) return [];
  const { data: pages } = await supabase
    .from("website_pages")
    .select("id, slug, title, sections, content_source")
    .eq("website_id", website.id)
    .order("order_index", { ascending: true });
  return pages ?? [];
}

export async function GET() {
  const supabase = await createClient();
  const caller = await who(supabase);
  if (caller.error) return caller.error;

  const [facts, pages, { data: dealership }] = await Promise.all([
    gatherBusinessFactsSafely(supabase, caller.dealershipId),
    livePages(supabase, caller.dealershipId),
    supabase.from("dealerships").select("claims_reviewed_at").eq("id", caller.dealershipId).maybeSingle(),
  ]);
  if (!facts) return NextResponse.json({ items: [], reviewedAt: null, unreadable: true });

  // Measured against facts with the machine's own writing taken out —
  // the site cannot be the evidence for the site.
  const honest = factsWithoutGeneratedCopy(facts, pages);
  const items = pages.flatMap((page: any) => reviewPage(page, honest));

  return NextResponse.json({
    items,
    reviewedAt: dealership?.claims_reviewed_at ?? null,
    pages: pages.map((p: any) => ({ slug: p.slug, title: p.title, contentSource: p.content_source })),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const caller = await who(supabase);
  if (caller.error) return caller.error;
  const { dealershipId } = caller;

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const service = createServiceClient();

  if (action === "finish") {
    const { error } = await service.from("dealerships").update({ claims_reviewed_at: new Date().toISOString() }).eq("id", dealershipId);
    if (error) return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 500 });
    return NextResponse.json({ reviewedAt: new Date().toISOString() });
  }

  const sentence = String(body?.sentence ?? "").trim();
  if (!sentence) return NextResponse.json({ error: "Which line?" }, { status: 400 });

  if (action === "keep") {
    // The owner standing behind it. From here the claim is backed by
    // them, not by the page that happened to print it — so it stops
    // being flagged, and other surfaces may use it too.
    const { error } = await service.from("business_knowledge").insert({
      dealership_id: dealershipId,
      category: "business_story",
      title: "Something I can stand behind",
      content: sentence,
      is_active: true,
    });
    if (error) return NextResponse.json({ error: `Couldn't save that to your Business Knowledge: ${error.message}` }, { status: 500 });
    return NextResponse.json({ kept: sentence });
  }

  if (action === "remove") {
    const pageId = String(body?.pageId ?? "");
    const blockId = body?.blockId ? String(body.blockId) : null;
    const field = String(body?.field ?? "");
    if (!pageId || !["text", "heading", "html", "label"].includes(field)) {
      return NextResponse.json({ error: "Which line, on which page?" }, { status: 400 });
    }

    // Scoped to this business's own website before anything is written.
    const pages = await livePages(supabase, dealershipId);
    const page = pages.find((p: any) => p.id === pageId);
    if (!page) return NextResponse.json({ error: "That page isn't on your website." }, { status: 404 });

    let touched = false;
    const strip = (node: any): any => {
      if (Array.isArray(node)) return node.map(strip);
      if (!node || typeof node !== "object") return node;
      const next = { ...node };
      if (next.props && typeof next.props === "object" && (!blockId || next.id === blockId) && typeof next.props[field] === "string") {
        const after = withoutSentence(next.props[field], sentence);
        if (after !== next.props[field]) {
          next.props = { ...next.props, [field]: after };
          touched = true;
        }
      }
      if (next.children) next.children = strip(next.children);
      return next;
    };
    const sections = strip(page.sections);
    if (!touched) return NextResponse.json({ error: "That line isn't on the page any more — reload the list." }, { status: 409 });

    const { error } = await service.from("website_pages").update({ sections, updated_at: new Date().toISOString() }).eq("id", pageId);
    if (error) return NextResponse.json({ error: `Couldn't update the page: ${error.message}` }, { status: 500 });
    return NextResponse.json({ removed: sentence });
  }

  return NextResponse.json({ error: "Choose keep, remove or finish." }, { status: 400 });
}
