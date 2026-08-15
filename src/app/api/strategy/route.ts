import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateMarketingStrategy } from "@/lib/agents/strategyAgent";
import { getCampaignPerformance } from "@/lib/agents/analyticsAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("marketing_strategies")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { monthly_budget, goal, target_leads } = await request.json();
  if (!monthly_budget || monthly_budget <= 0) return NextResponse.json({ error: "Enter a valid monthly budget" }, { status: 400 });
  if (!goal) return NextResponse.json({ error: "Choose a goal" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, city, business_category").eq("id", dealershipId).single();
  const { data: brandProfile } = await supabase.from("brand_profiles").select("tone_of_voice, target_persona, messaging_pillars").eq("dealership_id", dealershipId).maybeSingle();

  // Ground the plan in this dealer's own real cost-per-lead when they
  // have launched-campaign history — a weighted average (total spend
  // / total leads across campaigns that actually generated leads),
  // not an average of each campaign's own ratio, so one low-spend
  // campaign doesn't skew the number.
  const performance = await getCampaignPerformance(supabase, dealershipId);
  const withLeads = performance.campaigns.filter((c) => c.leads > 0);
  const totalSpend = withLeads.reduce((sum, c) => sum + c.spend, 0);
  const totalLeads = withLeads.reduce((sum, c) => sum + c.leads, 0);
  const historicalCostPerLead = totalLeads > 0 ? totalSpend / totalLeads : null;

  const targetLeads = typeof target_leads === "number" && target_leads > 0 ? target_leads : null;

  const plan = await generateMarketingStrategy(
    dealership?.dealership_name ?? "the business",
    dealership?.city ?? null,
    monthly_budget,
    goal,
    brandProfile,
    dealership?.business_category ?? "car dealership",
    { supabase, dealershipId },
    targetLeads,
    historicalCostPerLead
  );

  if ((plan as any)._fallback) {
    return NextResponse.json({ error: "Couldn't generate your plan right now — please try again in a moment." }, { status: 503 });
  }

  const { data: saved, error } = await supabase
    .from("marketing_strategies")
    .insert({ dealership_id: dealershipId, monthly_budget, goal, plan })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(saved);
}
