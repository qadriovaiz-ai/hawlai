import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { explainCampaign } from "@/lib/agents/reportingAgent";
import { getCampaignPerformance } from "@/lib/agents/analyticsAgent";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: campaign } = await supabase
    .from("ad_creatives")
    .select("headline, body_copy, daily_budget, targeting_city, creative_score")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: dealership } = await supabase.from("dealerships").select("business_category").eq("id", dealershipId).single();
  const performance = await getCampaignPerformance(supabase, dealershipId);
  const thisPerf = performance.campaigns.find((c) => c.id === id) ?? null;

  const explanation = await explainCampaign(campaign, thisPerf, dealership?.business_category ?? "car dealership");
  return NextResponse.json({ explanation });
}
