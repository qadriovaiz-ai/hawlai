import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runSalesAgentTurn } from "@/lib/agents/chatbotAgent";
import { recordFirstTouchpoint } from "@/lib/agents/touchpointAgent";
import { getBusinessContext } from "@/lib/businessBrain";
import { resolvePersona } from "@/lib/agents/personas";
import { resolvePublicSite } from "@/lib/publicSite";
import { readPageKinds } from "@/lib/growth/intent";
import { describeVisitorPage } from "@/lib/chat/visitorPage";
import { recordAnswerGap } from "@/lib/chat/answerGaps";
import { visitPath } from "@/lib/utils";

// Public, unauthenticated — the AI Sales Agent widget posts here.
//
// V4a: IT ANSWERS FOR A WEBSITE BUILDER STOREFRONT TOO. Until now this
// route read `landing_pages` and nothing else, so the agent existed on
// the one-page quick launch and NOT on a real built site — the one with
// products, policies and an about page, where a visitor actually has
// something to ask about. That was a placement problem, not an
// intelligence problem, and it was most of V4's value.
//
// The landing-page-or-site fallback is lib/publicSite's, the same one
// /api/public/track and /api/public/leads use, so an unpublished draft
// resolves to nobody here as well.
export async function POST(request: Request) {
  const { slug, message, history, path } = await request.json();
  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });
  if (!message || message.trim().length < 1) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (message.length > 500) return NextResponse.json({ error: "Message is too long" }, { status: 400 });

  const supabase = createServiceClient();
  const site = await resolvePublicSite(supabase, slug);
  if (!site) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  const dealershipId = site.dealershipId;

  // A LANDING PAGE HAS A HEADLINE AND AN OFFER; A STOREFRONT HAS
  // NEITHER, and must not be given somebody else's. These two fields
  // are the quick-launch page's own copy — on a site they stay null,
  // and the agent falls back to the business's facts, which is what it
  // should have been doing anyway. V4b gives it the page the visitor
  // is actually standing on.
  const [{ data: dealership }, { data: page }] = await Promise.all([
    supabase.from("dealerships").select("booking_slug").eq("id", dealershipId).maybeSingle(),
    site.source === "landing_page"
      ? supabase.from("landing_pages").select("headline, offer_text").eq("slug", slug).eq("published", true).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // P3 20a — was its own separate dealerships/brand_profiles query;
  // now the same shared assembler chat and calls already use, so this
  // surface gains business_knowledge (hours/pricing/policies/FAQs) for
  // the first time — it had zero access before. messaging_pillars
  // stays its own small query — getBusinessContext doesn't carry it
  // (a separate brand_profiles column from the structured brandVoice
  // object it does return), kept as-is rather than folding it in and
  // risking a behavior change beyond "same source, more facts."
  const [businessCtx, { data: brandProfile }, persona] = await Promise.all([
    getBusinessContext(supabase, dealershipId),
    supabase.from("brand_profiles").select("messaging_pillars").eq("dealership_id", dealershipId).maybeSingle(),
    resolvePersona(supabase, dealershipId, "website_chat"), // P3 piece 5 — defaults to sales
  ]);

  // WHERE THE VISITOR IS STANDING — V4b. The path is re-sanitised
  // here because the browser sent it, and the page kinds come from the
  // business's own `website_pages` declarations (V3's reader). A failed
  // read gives null, and null means the agent is simply told nothing
  // about the page — the same answer it had before V4b, rather than a
  // guess.
  const kinds = await readPageKinds(supabase, dealershipId);
  const visitorPage = describeVisitorPage(
    visitPath(typeof path === "string" ? path : null),
    kinds,
    businessCtx.facts
  );

  const { reply, leadCapture, suggestBooking, unanswered } = await runSalesAgentTurn(
    {
      dealershipName: businessCtx.name,
      city: businessCtx.city,
      businessCategory: businessCtx.category,
      headline: page?.headline ?? null,
      offerText: page?.offer_text ?? null,
      toneOfVoice: businessCtx.toneOfVoice,
      messagingPillars: brandProfile?.messaging_pillars,
      knowledgeFacts: businessCtx.knowledgeFacts,
      personaGoals: persona.goals,
      hasBookingLink: !!dealership?.booking_slug,
      // F-15: the widget knew the owner's notes and nothing about what
      // the business sells, so a visitor asking a price was answered by
      // a model that had never been given one. getBusinessContext
      // already gathered these for this request.
      facts: businessCtx.facts,
      visitorPageLine: visitorPage?.line ?? null,
    },
    Array.isArray(history) ? history.slice(-6) : [],
    message.trim(),
    { supabase, dealershipId }
  );

  // A CUSTOMER ASKED SOMETHING THE RECORDS COULD NOT ANSWER — V4c.
  //
  // Recorded before the lead work below, because it is true whether or
  // not they left their details: the gap is a fact about the business,
  // and a visitor who asks and leaves has still told us what is
  // missing. Never throws and never blocks the reply — a visitor is
  // waiting on this request.
  //
  // What is NOT recorded: their words, their name, their id. See
  // lib/chat/answerGaps.
  if (unanswered) await recordAnswerGap(supabase, dealershipId, unanswered);

  // Real CRM update — only when the visitor volunteered a name and at
  // least one real identity signal (never fabricated). P2 27a-ii —
  // previously required phone specifically, so a visitor who only
  // gave an email was never captured at all. Matches an existing lead
  // by phone first (the stronger signal), falling back to email only
  // when no phone was given — never both loosely, to avoid a false
  // match on a mistyped/shared email.
  let leadCaptured = false;
  if (leadCapture?.phone || leadCapture?.email) {
    let existing: { id: string } | null = null;
    if (leadCapture.phone) {
      const { data } = await supabase.from("leads").select("id").eq("dealership_id", dealershipId).eq("phone", leadCapture.phone).maybeSingle();
      existing = data;
    }
    if (!existing && leadCapture.email) {
      const { data } = await supabase.from("leads").select("id").eq("dealership_id", dealershipId).eq("email", leadCapture.email).maybeSingle();
      existing = data;
    }

    if (existing) {
      await supabase.from("leads").update({
        name: leadCapture.name,
        phone: leadCapture.phone ?? undefined,
        email: leadCapture.email ?? undefined,
        qualification_reason: leadCapture.interest ?? undefined,
      }).eq("id", existing.id);
    } else {
      const { data: newLead } = await supabase.from("leads").insert({
        dealership_id: dealershipId,
        name: leadCapture.name,
        phone: leadCapture.phone ?? null,
        email: leadCapture.email ?? null,
        source: "ai_sales_agent",
        qualification_reason: leadCapture.interest ?? null,
      }).select("id").single();
      if (newLead) {
        await recordFirstTouchpoint(supabase, { leadId: newLead.id, dealershipId: dealershipId, source: "ai_sales_agent" });
      }
    }
    leadCaptured = true;
  }

  return NextResponse.json({
    reply,
    leadCaptured,
    bookingLink: suggestBooking && dealership?.booking_slug ? `/book/${dealership.booking_slug}` : null,
  });
}
