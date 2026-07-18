import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("influencers").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false });
  return NextResponse.json({ influencers: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase.from("influencers").insert({
    dealership_id: dealershipId,
    name: body.name,
    handle: body.handle ?? null,
    platform: body.platform ?? "instagram",
    followers_estimate: body.followersEstimate ?? null,
    contact_info: body.contactInfo ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, influencer: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id, ...fields } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const update: any = {};
  if (fields.status !== undefined) update.status = fields.status;
  if (fields.campaignName !== undefined) update.campaign_name = fields.campaignName;
  if (fields.startDate !== undefined) update.start_date = fields.startDate;
  if (fields.endDate !== undefined) update.end_date = fields.endDate;
  if (fields.agreedAmount !== undefined) update.agreed_amount = fields.agreedAmount;
  if (fields.leadsGenerated !== undefined) update.leads_generated = fields.leadsGenerated;
  if (fields.revenueGenerated !== undefined) update.revenue_generated = fields.revenueGenerated;
  if (fields.notes !== undefined) update.notes = fields.notes;

  const { error } = await supabase.from("influencers").update(update).eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { id } = await request.json();
  const { error } = await supabase.from("influencers").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
