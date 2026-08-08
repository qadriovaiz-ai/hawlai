import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateSocialTask } from "@/lib/agents/socialManagementAgent";

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

  const { taskType, inputText } = await request.json();
  if (!taskType) return NextResponse.json({ error: "taskType required" }, { status: 400 });

  const [{ data: dealership }, { data: brandProfile }, { data: recentPosts }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle(),
    supabase.from("content_autopilot_log").select("caption").eq("dealership_id", dealershipId).eq("success", true).order("created_at", { ascending: false }).limit(10),
  ]);
  const recentPostsContext = (recentPosts ?? []).length > 0
    ? (recentPosts ?? []).map((p: any) => `- ${(p.caption ?? "").slice(0, 120)}`).join("\n")
    : null;

  const { output, _fallback } = await generateSocialTask(
    taskType,
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "car dealership",
    inputText ?? "",
    brandProfile,
    { supabase, dealershipId },
    recentPostsContext
  );

  let saved = null;
  if (!_fallback) {
    const { data } = await supabase
      .from("social_management_items")
      .insert({ dealership_id: dealershipId, task_type: taskType, input_text: inputText ?? "", output })
      .select()
      .single();
    saved = data;
  }

  return NextResponse.json({ output, _fallback, id: saved?.id ?? null });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, output } = await request.json();
  if (!id || output === undefined) return NextResponse.json({ error: "id and output required" }, { status: 400 });

  const { data, error } = await supabase
    .from("social_management_items")
    .update({ output })
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, item: data });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("social_management_items")
    .select("*")
    .eq("dealership_id", dealershipId)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ items: data ?? [] });
}
