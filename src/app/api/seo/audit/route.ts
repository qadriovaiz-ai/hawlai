import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { auditLandingPage } from "@/lib/agents/seoAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: page } = await supabase
    .from("landing_pages")
    .select("published, slug, headline, subheadline, hero_image_url, car_listings")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  const audit = auditLandingPage(page);
  return NextResponse.json(audit);
}
