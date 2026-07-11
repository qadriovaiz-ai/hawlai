import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { qualifyLead } from "@/lib/ai-engine";

// Public, unauthenticated endpoint — the landing page's lead capture
// form posts here directly, no login involved.
export async function POST(request: Request) {
  const body = await request.json();
  const { slug, name, phone, vehicle, budget, honeypot } = body;

  // Simple bot trap: real visitors never fill a hidden field.
  if (honeypot) return NextResponse.json({ success: true });

  if (!slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });
  if (!name || name.trim().length < 2) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!phone || phone.trim().length < 8) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });

  const supabase = createServiceClient();

  const { data: landingPage } = await supabase
    .from("landing_pages")
    .select("dealership_id, published")
    .eq("slug", slug)
    .maybeSingle();

  if (!landingPage || !landingPage.published) {
    return NextResponse.json({ error: "This page is not accepting leads right now" }, { status: 404 });
  }

  const qualification = qualifyLead({ purchaseYear: null, budget: budget ? Number(budget) : null, phone });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("dealership_id", landingPage.dealership_id)
    .eq("phone", phone.trim())
    .gte("created_at", thirtyDaysAgo)
    .maybeSingle();

  if (existingLead) {
    // Already have this person recently — don't create a duplicate,
    // but still show the visitor a normal thank-you.
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase.from("leads").insert({
    dealership_id: landingPage.dealership_id,
    name: name.trim(),
    phone: phone.trim(),
    vehicle: vehicle ?? null,
    budget: budget ? Number(budget) : null,
    source: "landing_page",
    ai_score: qualification.score,
    lead_temperature: qualification.temperature,
    status: "ready_to_call",
    qualification_reason: qualification.reason,
  });

  if (error) return NextResponse.json({ error: "Something went wrong, please try again" }, { status: 500 });
  return NextResponse.json({ success: true });
}
