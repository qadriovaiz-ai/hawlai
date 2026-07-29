import { createClient } from "@/lib/supabase/server";
import { generate3DScene } from "@/lib/agents/threeDAgent";
import { NextResponse } from "next/server";

async function getContext(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return null;
  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, business_category").eq("id", profile.dealership_id).single();
  return { dealershipId: profile.dealership_id, dealershipName: dealership?.dealership_name ?? "the business", businessCategory: dealership?.business_category ?? "business" };
}

export async function GET() {
  const supabase = await createClient();
  const ctx = await getContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: scenes } = await supabase
    .from("three_d_scenes")
    .select("id, name, prompt, status, created_at")
    .eq("dealership_id", ctx.dealershipId)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ scenes: scenes ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const ctx = await getContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt } = await request.json();
  if (!prompt || !prompt.trim()) return NextResponse.json({ error: "Describe what you want to see in 3D" }, { status: 400 });

  const { data: scene, error: insertError } = await supabase.from("three_d_scenes").insert({
    dealership_id: ctx.dealershipId,
    name: prompt.slice(0, 60),
    prompt,
    status: "pending",
  }).select("id").single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const result = await generate3DScene(prompt, ctx.dealershipName, ctx.businessCategory, { supabase, dealershipId: ctx.dealershipId });

  if (result.error || !result.html) {
    await supabase.from("three_d_scenes").update({ status: "failed", error_message: result.error }).eq("id", scene.id);
    return NextResponse.json({ error: result.error ?? "Generation failed" }, { status: 502 });
  }

  await supabase.from("three_d_scenes").update({ status: "ready", html_code: result.html }).eq("id", scene.id);
  return NextResponse.json({ success: true, id: scene.id });
}
