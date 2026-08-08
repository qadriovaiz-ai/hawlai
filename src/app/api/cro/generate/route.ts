import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateCroSuggestions } from "@/lib/agents/croAgentV2";
import { requireFeature } from "@/lib/featureGate";

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

  const gate = await requireFeature(supabase, dealershipId, "cro");
  if (!gate.allowed) return gate.response;

  const { taskType } = await request.json();
  if (!taskType) return NextResponse.json({ error: "taskType required" }, { status: 400 });

  const [{ data: dealership }, { data: page }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("landing_pages").select("headline, subheadline, offer_text").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: events }, { data: orders }, { data: carts }] = await Promise.all([
    supabase.from("page_events").select("event_type").eq("dealership_id", dealershipId).gte("created_at", thirtyDaysAgo),
    supabase.from("orders").select("id, status").eq("dealership_id", dealershipId).gte("created_at", thirtyDaysAgo).neq("status", "cancelled"),
    supabase.from("abandoned_carts").select("id").eq("dealership_id", dealershipId).gte("created_at", thirtyDaysAgo),
  ]);
  const all = events ?? [];
  const orderCount = (orders ?? []).length;
  const cartCount = (carts ?? []).length;
  const views = all.filter((e) => e.event_type === "view").length;
  // Real rates, not estimates — undefined (not 0) when there's too
  // little data to make the rate meaningful, so the AI isn't fed a
  // misleading "0% conversion" from e.g. 2 total visits.
  const conversionRate = views >= 10 ? Math.round((orderCount / views) * 1000) / 10 : null;
  const cartAbandonmentRate = orderCount + cartCount >= 5 ? Math.round((cartCount / (orderCount + cartCount)) * 1000) / 10 : null;

  const { output, _fallback } = await generateCroSuggestions(
    taskType,
    dealership?.dealership_name ?? "the business",
    dealership?.business_category ?? "business",
    {
      headline: page?.headline,
      subheadline: page?.subheadline,
      offerText: page?.offer_text,
      views,
      chatOpens: all.filter((e) => e.event_type === "chat_open").length,
      formSubmits: all.filter((e) => e.event_type === "form_submit").length,
      orders: orderCount,
      conversionRate,
      cartAbandonmentRate,
    },
    { supabase, dealershipId }
  );

  let saved = null;
  if (!_fallback) {
    const { data } = await supabase.from("cro_items").insert({ dealership_id: dealershipId, task_type: taskType, output }).select().single();
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
    .from("cro_items")
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

  const { data } = await supabase.from("cro_items").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(30);
  return NextResponse.json({ items: data ?? [] });
}
