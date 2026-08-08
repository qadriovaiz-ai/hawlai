import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/featureGate";

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

  const { data } = await supabase.from("collab_listings").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false });
  return NextResponse.json({ listings: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const gate = await requireFeature(supabase, dealershipId, "influencerMarketing");
  if (!gate.allowed) return gate.response;

  const body = await request.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase.from("collab_listings").insert({
    dealership_id: dealershipId,
    title: body.title.trim(),
    description: body.description ?? null,
    compensation_type: ["product", "paid", "both"].includes(body.compensationType) ? body.compensationType : "product",
    compensation_details: body.compensationDetails ?? null,
    is_public: body.isPublic !== false,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, listing: data });
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
  if (fields.isPublic !== undefined) update.is_public = fields.isPublic;
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.description !== undefined) update.description = fields.description;
  if (fields.compensationType !== undefined) update.compensation_type = fields.compensationType;
  if (fields.compensationDetails !== undefined) update.compensation_details = fields.compensationDetails;

  const { error } = await supabase.from("collab_listings").update(update).eq("id", id).eq("dealership_id", dealershipId);
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
  const { error } = await supabase.from("collab_listings").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
