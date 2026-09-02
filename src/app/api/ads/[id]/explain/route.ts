import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { explainCampaign, getComparisonCampaigns } from "@/lib/agents/reportingAgent";
import { getCampaignPerformanceState } from "@/lib/agents/analyticsAgent";

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
    .select("id, headline, body_copy, daily_budget, targeting_city, creative_score, mode, background_style, scheduled_start, variant_group_id")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: dealership } = await supabase.from("dealerships").select("business_category").eq("id", dealershipId).single();
  const performanceState = await getCampaignPerformanceState(supabase, dealershipId);
  if (performanceState.state !== "ok") {
    // Returned instead of explaining. This endpoint's whole output is
    // "why did this campaign perform this way" — produced without the
    // numbers it would be confident prose about nothing, which is a
    // worse failure than declining.
    return NextResponse.json({
      explanation:
        performanceState.state === "not_connected"
          ? "Your Meta ad account isn't connected, so this campaign's performance can't be read. Reconnect it in Settings → Integrations and this explanation will work."
          : performanceState.state === "error"
          ? "Couldn't load campaign performance just now — try again in a moment."
          : performanceState.reason,
      unavailable: true,
    });
  }

  const performance = performanceState.value;
  const thisPerf = performance.campaigns.find((c) => c.id === id) ?? null;
  const comparisons = await getComparisonCampaigns(supabase, dealershipId, campaign, performance.campaigns);

  const explanation = await explainCampaign(campaign, thisPerf, dealership?.business_category ?? "car dealership", { supabase, dealershipId }, comparisons);
  return NextResponse.json({ explanation });
}
