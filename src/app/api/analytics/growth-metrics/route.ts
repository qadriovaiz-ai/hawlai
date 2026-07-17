import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getCampaignPerformance } from "@/lib/agents/analyticsAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const [{ data: leads }, performance] = await Promise.all([
    supabase.from("leads").select("status, deal_value, created_at").eq("dealership_id", dealershipId),
    getCampaignPerformance(supabase, dealershipId),
  ]);

  const allLeads = leads ?? [];
  const converted = allLeads.filter((l: any) => l.status === "converted");
  const totalSpend = performance.totals.spend;

  // CAC — real cost per customer acquired (not just per lead): total ad
  // spend divided by leads that actually converted. Null when there's
  // no spend or no conversions yet, rather than showing a misleading 0.
  const cac = totalSpend > 0 && converted.length > 0 ? totalSpend / converted.length : null;

  // LTV — average deal value of converted leads. This is a single-
  // purchase estimate based on the deal_value field the dealer enters;
  // Hawlai doesn't yet track repeat purchases per customer, so this is
  // NOT a true multi-purchase lifetime value — labeled as such in the UI.
  const dealValues = converted.map((l: any) => Number(l.deal_value) || 0).filter((v: number) => v > 0);
  const ltv = dealValues.length > 0 ? dealValues.reduce((a: number, b: number) => a + b, 0) / dealValues.length : null;

  const conversionRate = allLeads.length > 0 ? (converted.length / allLeads.length) * 100 : null;

  return NextResponse.json({
    cac,
    ltv,
    conversionRate,
    totalLeads: allLeads.length,
    convertedLeads: converted.length,
    totalSpend,
  });
}
