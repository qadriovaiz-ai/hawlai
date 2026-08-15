import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { updateCampaignGroup, deleteCampaignGroup } from "@/lib/agents/campaignGroupAgent";

async function resolveDealershipId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  return profile?.dealership_id ?? null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const dealershipId = await resolveDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, status } = await request.json();
  const update: { name?: string; status?: "active" | "archived" } = {};
  if (name !== undefined) update.name = name.trim();
  if (status !== undefined) {
    if (!["active", "archived"].includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    update.status = status;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await updateCampaignGroup(supabase, dealershipId, id, update);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const dealershipId = await resolveDealershipId(supabase);
  if (!dealershipId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await deleteCampaignGroup(supabase, dealershipId, id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
