import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { runSalesAgentTurn } from "@/lib/agents/chatbotAgent";

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
    .select("dealership_id, headline, offer_text, dealerships(dealership_name, city, business_category, booking_slug)")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const dealership = (page as any).dealerships;
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, messaging_pillars")
    .eq("dealership_id", page.dealership_id)
    .maybeSingle();

  const { reply, leadCapture, suggestBooking } = await runSalesAgentTurn(
    {
      dealershipName: dealership?.dealership_name ?? "the business",
      city: dealership?.city,
      businessCategory: dealership?.business_category,
      headline: page.headline,
      offerText: page.offer_text,
      toneOfVoice: brandProfile?.tone_of_voice,
      messagingPillars: brandProfile?.messaging_pillars,
      hasBookingLink: !!dealership?.booking_slug,
    },
    Array.isArray(history) ? history.slice(-6) : [],
    message.trim()
  );

  // Real CRM update — only when the visitor volunteered both a name
  // and phone number in the conversation (never fabricated). Matches
  // an existing lead by phone so a returning visitor doesn't create
  // duplicates, same pattern as the public booking endpoint.
  let leadCaptured = false;
  if (leadCapture?.phone) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("dealership_id", page.dealership_id)
      .eq("phone", leadCapture.phone)
      .maybeSingle();

    if (existing) {
      await supabase.from("leads").update({
        name: leadCapture.name,
        email: leadCapture.email ?? undefined,
        qualification_reason: leadCapture.interest ?? undefined,
      }).eq("id", existing.id);
    } else {
      await supabase.from("leads").insert({
        dealership_id: page.dealership_id,
        name: leadCapture.name,
        phone: leadCapture.phone,
        email: leadCapture.email ?? null,
        source: "ai_sales_agent",
        qualification_reason: leadCapture.interest ?? null,
      });
    }
    leadCaptured = true;
  }

  return NextResponse.json({
    reply,
    leadCaptured,
    bookingLink: suggestBooking && dealership?.booking_slug ? `/book/${dealership.booking_slug}` : null,
  });
}
