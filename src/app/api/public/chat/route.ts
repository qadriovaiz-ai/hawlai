import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runSalesAgentTurn } from "@/lib/agents/chatbotAgent";
import { recordFirstTouchpoint } from "@/lib/agents/touchpointAgent";
import { getBusinessContext } from "@/lib/businessBrain";

// Public, unauthenticated — the landing page AI Sales Agent widget
// posts here.
export async function POST(request: Request) {
  const { slug, message, history } = await request.json();
  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });
  if (!message || message.trim().length < 1) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (message.length > 500) return NextResponse.json({ error: "Message is too long" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: page } = await supabase
    .from("landing_pages")
    .select("dealership_id, headline, offer_text, dealerships(booking_slug)")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const dealership = (page as any).dealerships;
  // P3 20a — was its own separate dealerships/brand_profiles query;
  // now the same shared assembler chat and calls already use, so this
  // surface gains business_knowledge (hours/pricing/policies/FAQs) for
  // the first time — it had zero access before. messaging_pillars
  // stays its own small query — getBusinessContext doesn't carry it
  // (a separate brand_profiles column from the structured brandVoice
  // object it does return), kept as-is rather than folding it in and
  // risking a behavior change beyond "same source, more facts."
  const [businessCtx, { data: brandProfile }] = await Promise.all([
    getBusinessContext(supabase, page.dealership_id),
    supabase.from("brand_profiles").select("messaging_pillars").eq("dealership_id", page.dealership_id).maybeSingle(),
  ]);

  const { reply, leadCapture, suggestBooking } = await runSalesAgentTurn(
    {
      dealershipName: businessCtx.name,
      city: businessCtx.city,
      businessCategory: businessCtx.category,
      headline: page.headline,
      offerText: page.offer_text,
      toneOfVoice: businessCtx.toneOfVoice,
      messagingPillars: brandProfile?.messaging_pillars,
      knowledgeFacts: businessCtx.knowledgeFacts,
      hasBookingLink: !!dealership?.booking_slug,
    },
    Array.isArray(history) ? history.slice(-6) : [],
    message.trim(),
    { supabase, dealershipId: page.dealership_id }
  );

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
      const { data } = await supabase.from("leads").select("id").eq("dealership_id", page.dealership_id).eq("phone", leadCapture.phone).maybeSingle();
      existing = data;
    }
    if (!existing && leadCapture.email) {
      const { data } = await supabase.from("leads").select("id").eq("dealership_id", page.dealership_id).eq("email", leadCapture.email).maybeSingle();
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
        dealership_id: page.dealership_id,
        name: leadCapture.name,
        phone: leadCapture.phone ?? null,
        email: leadCapture.email ?? null,
        source: "ai_sales_agent",
        qualification_reason: leadCapture.interest ?? null,
      }).select("id").single();
      if (newLead) {
        await recordFirstTouchpoint(supabase, { leadId: newLead.id, dealershipId: page.dealership_id, source: "ai_sales_agent" });
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
