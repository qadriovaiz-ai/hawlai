import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateAdPlan } from "@/lib/agents/paidAdsAgent";

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

  const { platform, taskType } = await request.json();
  if (!platform || !taskType) return NextResponse.json({ error: "platform and taskType required" }, { status: 400 });

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const { output, _fallback } = await generateAdPlan(
    platform,
    taskType,
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "car dealership",
    brandProfile
  );

  let saved = null;
  if (!_fallback) {
    const { data } = await supabase
      .from("paid_ads_plans")
      .insert({ dealership_id: dealershipId, platform, task_type: taskType, output })
      .select()
      .single();
    saved = data;
  }

  return NextResponse.json({ output, _fallback, id: saved?.id ?? null });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");

  let query = supabase.from("paid_ads_plans").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(30);
  if (platform) query = query.eq("platform", platform);

  const { data } = await query;
  return NextResponse.json({ items: data ?? [] });
}
