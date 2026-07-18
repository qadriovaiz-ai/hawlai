import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getCampaignPerformance } from "@/lib/agents/analyticsAgent";
import { generateGrowthReport } from "@/lib/agents/growthAdvisorAgent";
import {
  computeRevenueForecast,
  generateGrowthOpportunities,
  generateBudgetRecommendations,
  generateExpansionStrategy,
} from "@/lib/agents/growthAdvisorV2";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { taskType } = await request.json();
  if (!taskType) return NextResponse.json({ error: "taskType required" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single();
  const name = dealership?.dealership_name ?? "the business";
  const category = dealership?.business_category ?? "business";

  let result: { output: any; _fallback?: boolean };
  if (taskType === "revenue_forecast") {
    const forecast = await computeRevenueForecast(supabase, dealershipId, name, category);
    return NextResponse.json({ output: forecast, _fallback: false });
  }

  if (taskType === "growth_opportunities") {
    const { data: leads } = await supabase.from("leads").select("status, lead_temperature, source").eq("dealership_id", dealershipId).limit(300);
    const all = leads ?? [];
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const l of all) {
      byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
      bySource[l.source ?? "unknown"] = (bySource[l.source ?? "unknown"] ?? 0) + 1;
    }
    const context = `Total leads: ${all.length}. By status: ${JSON.stringify(byStatus)}. By source: ${JSON.stringify(bySource)}.`;
    result = await generateGrowthOpportunities(name, category, context);
  } else if (taskType === "budget_recommendations") {
    const performance = await getCampaignPerformance(supabase, dealershipId);
    const context = performance.campaigns.length > 0
      ? performance.campaigns.map((c) => `${c.headline}: spend ₹${c.spend}, leads ${c.leads}, revenue ₹${c.revenue}, cost/lead ${c.cost_per_lead ?? "—"}`).join("\n")
      : "No campaign performance data yet.";
    result = await generateBudgetRecommendations(name, category, context);
  } else if (taskType === "expansion_strategy") {
    const growth = await generateGrowthReport(supabase, dealershipId, category);
    const { data: leads } = await supabase.from("leads").select("status").eq("dealership_id", dealershipId);
    const converted = (leads ?? []).filter((l: any) => l.status === "converted").length;
    const context = `Health score: ${growth.healthScore}/100. Total leads: ${(leads ?? []).length}. Converted: ${converted}. Known risks: ${growth.risks.join("; ") || "none flagged"}.`;
    result = await generateExpansionStrategy(name, category, dealership?.city ?? null, growth.healthScore, context);
  } else {
    return NextResponse.json({ error: "Unknown taskType" }, { status: 400 });
  }

  const { output, _fallback } = result;
  let saved = null;
  if (!_fallback) {
    const { data } = await supabase.from("growth_advisor_items").insert({ dealership_id: dealershipId, task_type: taskType, output }).select().single();
    saved = data;
  }
  return NextResponse.json({ output, _fallback, id: saved?.id ?? null });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("growth_advisor_items").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(30);
  return NextResponse.json({ items: data ?? [] });
}
