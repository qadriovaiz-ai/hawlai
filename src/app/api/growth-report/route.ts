import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateGrowthReport } from "@/lib/agents/growthAdvisorAgent";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("business_category").eq("id", dealershipId).single();
  const report = await generateGrowthReport(supabase, dealershipId, dealership?.business_category ?? "car dealership");
  return NextResponse.json(report);
}
