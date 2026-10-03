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
import { reviewPage, factsWithoutGeneratedCopy, withoutSentence, pageCoverage, groupBySentence } from "@/lib/claims/siteClaimsReview";

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
  // GROUPED BY SENTENCE. One row per line, however many rules it
  // tripped — the live card asked the owner to decide twice about the
  // same sentence, and Keep and Remove both act on the sentence anyway.
  const flags = pages.flatMap((page: any) => reviewPage(page, honest));
  const items = groupBySentence(flags);

  // WHAT WAS LOOKED AT, beside what was found. A card that lists seven
  // items and says nothing about the pages it was silent on makes a
  // suppressed line and a clean line look the same from outside.
  const coverage = pages.map((page: any) => {
    const c = pageCoverage(page);
    return { ...c, items: items.filter((i: any) => i.pageSlug === page.slug).length, flags: flags.filter((i: any) => i.pageSlug === page.slug).length, contentSource: page.content_source ?? null };
  });

  return NextResponse.json({
    items,
    reviewedAt: dealership?.claims_reviewed_at ?? null,
    pages: pages.map((p: any) => ({ slug: p.slug, title: p.title, contentSource: p.content_source })),
    coverage,
    totals: {
      pages: coverage.length,
      read: coverage.reduce((n: number, c: any) => n + c.read, 0),
      checked: coverage.reduce((n: number, c: any) => n + c.checked, 0),
      items: items.length,
      flags: flags.length,
      unreadable: coverage.filter((c: any) => c.unreadable).length,
    },
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
    // ONLY THE FLAGGED WORDS, never the sentence around them.
    //
    // The Contact page's Instagram line mixes a real handle with
    // "restock alerts" nobody has promised. Attesting the whole sentence
    // would quietly make the restock alerts true as well — and this row
    // is evidence from here on, for every surface.
    const claim = String(body?.claim ?? "").trim();
    if (!claim) {
      return NextResponse.json({ error: "I can't tell which words you're standing behind, so I won't record anything. Edit the line instead." }, { status: 400 });
    }
    if (!sentence.toLowerCase().includes(claim.toLowerCase())) {
      return NextResponse.json({ error: "That claim isn't in that sentence any more — reload the list." }, { status: 409 });
    }
    // A comparison with someone else's product is not the owner's to
    // attest: Hawlai has nothing to check it against whoever says it.
    if (body?.kind === "comparative") {
      return NextResponse.json({ error: "A comparison with another product can't be kept — reword it to say what yours is, or take it off the page." }, { status: 400 });
    }

    // WHERE A KEPT CONTACT DETAIL HAS TO LAND.
    //
    // A claim goes under business_story, which is what knownText reads.
    // A contact detail has to reach allowedContacts() instead — the
    // scrub that takes an invented email off a page — and that reads
    // ownerFacts' title and content. So it goes in as a fact too, under
    // 'general' (one of the six categories the live CHECK allows:
    // hours, pricing_note, policy, faq, general, business_story) with a
    // title a person reading their own Business Knowledge will
    // recognise. No migration, and the value is allowed on every
    // surface from the moment it is saved rather than only this page.
    const isContact = body?.kind === "contact";
    const { error } = await service.from("business_knowledge").insert({
      dealership_id: dealershipId,
      category: isContact ? "general" : "business_story",
      title: isContact ? "Contact detail I confirmed is mine" : "Something I can stand behind",
      content: claim,
      is_active: true,
    });
    if (error) return NextResponse.json({ error: `Couldn't save that to your Business Knowledge: ${error.message}` }, { status: 500 });
    return NextResponse.json({ kept: claim, storedAs: isContact ? "general" : "business_story" });
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

    // A legal page's sentence usually carries an obligation beside
    // whatever was flagged. Refused here as well as hidden in the card,
    // because a crafted request must not be able to delete a returns
    // position to clear a claims flag.
    const { isLegalPage } = await import("@/lib/seo/pageKinds");
    const { isWholeSentence } = await import("@/lib/claims/siteClaimsReview");
    const claimForRemoval = String(body?.claim ?? "").trim();
    if (isLegalPage(page) && claimForRemoval && !isWholeSentence(claimForRemoval, sentence)) {
      return NextResponse.json(
        { error: "That sentence is on a legal page and says more than the flagged words. Edit it in Website Builder instead — removing it would take the rest of the sentence with it." },
        { status: 400 }
      );
    }

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
      } else if (!next.props) {
        // A PAGE FROM BEFORE THE BLOCK BUILDER. Its words live in flat
        // fields and it has no id, so this matched nothing and Remove
        // answered "that line isn't on the page any more" about a line
        // that was — the same blindness that kept those pages off the
        // review list until the reader was shared.
        for (const key of ["headline", "subheadline", "heading", "title", "body", "text", "ctaText", "buttonText", "cta"]) {
          if (typeof next[key] !== "string") continue;
          const after = withoutSentence(next[key], sentence);
          if (after === next[key]) continue;
          next[key] = after;
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
