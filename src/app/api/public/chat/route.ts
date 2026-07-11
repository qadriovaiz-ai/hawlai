import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { answerVisitorQuestion } from "@/lib/agents/chatbotAgent";

// Public, unauthenticated — the landing page chat widget posts here.
export async function POST(request: Request) {
  const { slug, message, history } = await request.json();
  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });
  if (!message || message.trim().length < 1) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (message.length > 500) return NextResponse.json({ error: "Message is too long" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: page } = await supabase
    .from("landing_pages")
    .select("dealership_id, headline, offer_text, dealerships(dealership_name, city)")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const dealership = (page as any).dealerships;
  const { data: brandProfileByDealership } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, messaging_pillars")
    .eq("dealership_id", page.dealership_id)
    .maybeSingle();

  const reply = await answerVisitorQuestion(
    {
      dealershipName: dealership?.dealership_name ?? "the dealership",
      city: dealership?.city,
      headline: page.headline,
      offerText: page.offer_text,
      toneOfVoice: brandProfileByDealership?.tone_of_voice,
      messagingPillars: brandProfileByDealership?.messaging_pillars,
    },
    Array.isArray(history) ? history.slice(-6) : [],
    message.trim()
  );

  return NextResponse.json({ reply });
}
