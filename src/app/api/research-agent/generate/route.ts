import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateResearch, generateSentimentFromLeads } from "@/lib/agents/researchAgentV2";

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

  let result;
  if (taskType === "customer_sentiment") {
    const { data: leads } = await supabase.from("leads").select("qualification_reason, lead_temperature, status").eq("dealership_id", dealershipId).limit(200);
    result = await generateSentimentFromLeads(
      dealership?.dealership_name ?? "the business",
      dealership?.business_category ?? "business",
      (leads ?? []).map((l: any) => ({ qualificationReason: l.qualification_reason, temperature: l.lead_temperature, status: l.status }))
    );
  } else {
    result = await generateResearch(taskType, dealership?.dealership_name ?? "the business", dealership?.business_category ?? "business", dealership?.city ?? null);
  }

  const { output, _fallback } = result;
  let saved = null;
  if (!_fallback) {
    const { data } = await supabase.from("research_items").insert({ dealership_id: dealershipId, task_type: taskType, output }).select().single();
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

  const { data } = await supabase.from("research_items").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(30);
  return NextResponse.json({ items: data ?? [] });
}
