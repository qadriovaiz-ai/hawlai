import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateRetargetingCopy } from "@/lib/agents/retargetingAgent";
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

  const gate = await requireFeature(supabase, dealershipId, "retargeting");
  if (!gate.allowed) return gate.response;

  const { segmentType } = await request.json();
  if (!["abandoned_cart", "cold_lead", "lapsed_buyer"].includes(segmentType)) {
    return NextResponse.json({ error: "Invalid segmentType" }, { status: 400 });
  }

  const { data: dealership } = await supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single();
  const name = dealership?.dealership_name ?? "the business";
  const category = dealership?.business_category ?? "business";

  // Pull the same real segment data the segments endpoint computes, so
  // the ad copy is actually grounded in what's really in the cart/lead
  // list rather than written blind.
  let context = "";
  if (segmentType === "abandoned_cart") {
    const { data: carts } = await supabase.from("abandoned_carts").select("items").eq("dealership_id", dealershipId).eq("contacted", false).limit(5);
    const items = (carts ?? []).flatMap((c: any) => (c.items ?? []).map((i: any) => i.name));
    context = items.length > 0 ? `Recently abandoned items include: ${items.slice(0, 8).join(", ")}.` : "No specific item data available — write generically.";
  } else if (segmentType === "cold_lead") {
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).neq("status", "converted");
    context = `Approximately ${count ?? 0} leads have gone cold.`;
  } else {
    context = "One-time customers who haven't returned to buy again.";
  }

  const output = await generateRetargetingCopy(segmentType, name, category, context, { supabase, dealershipId });

  const { data: saved, error } = await supabase.from("retargeting_campaigns").insert({ dealership_id: dealershipId, segment_type: segmentType, output }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ output, id: saved.id });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, output } = await request.json();
  if (!id || !output) return NextResponse.json({ error: "id and output required" }, { status: 400 });

  const { data, error } = await supabase.from("retargeting_campaigns").update({ output }).eq("id", id).eq("dealership_id", dealershipId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("retargeting_campaigns").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(30);
  return NextResponse.json({ items: data ?? [] });
}
