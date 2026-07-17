import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateCompetitorIntel } from "@/lib/agents/competitorIntelAgent";

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

  const { taskType, competitorName } = await request.json();
  if (!taskType || !competitorName) return NextResponse.json({ error: "taskType and competitorName required" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single();

  const { output, _fallback } = await generateCompetitorIntel(
    taskType,
    competitorName,
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "business"
  );

  let saved = null;
  if (!_fallback) {
    const { data } = await supabase
      .from("competitor_intel_items")
      .insert({ dealership_id: dealershipId, task_type: taskType, competitor_name: competitorName, output })
      .select()
      .single();
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

  const { data } = await supabase
    .from("competitor_intel_items")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ items: data ?? [] });
}
