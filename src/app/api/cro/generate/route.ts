import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateCroSuggestions } from "@/lib/agents/croAgentV2";

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

  const [{ data: dealership }, { data: page }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("landing_pages").select("headline, subheadline, offer_text").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase.from("page_events").select("event_type").eq("dealership_id", dealershipId).gte("created_at", thirtyDaysAgo);
  const all = events ?? [];

  const { output, _fallback } = await generateCroSuggestions(
    taskType,
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "business",
    {
      headline: page?.headline,
      subheadline: page?.subheadline,
      offerText: page?.offer_text,
      views: all.filter((e) => e.event_type === "view").length,
      chatOpens: all.filter((e) => e.event_type === "chat_open").length,
      formSubmits: all.filter((e) => e.event_type === "form_submit").length,
    }
  );

  let saved = null;
  if (!_fallback) {
    const { data } = await supabase.from("cro_items").insert({ dealership_id: dealershipId, task_type: taskType, output }).select().single();
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

  const { data } = await supabase.from("cro_items").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(30);
  return NextResponse.json({ items: data ?? [] });
}
