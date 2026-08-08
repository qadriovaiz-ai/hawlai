import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("owner_id, approval_threshold").eq("id", dealershipId).single();
  return NextResponse.json({
    approvalThreshold: dealership?.approval_threshold ?? 50000,
    isOwner: dealership?.owner_id === user.id,
  });
}

// Only the owner can change this — it directly controls how much
// spend a Marketing Manager can approve without the owner's signoff,
// so it's deliberately not something an admin or team member can
// touch, even though admins otherwise have unlimited approval power.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("owner_id").eq("id", dealershipId).single();
  if (dealership?.owner_id !== user.id) return NextResponse.json({ error: "Only the owner can change this" }, { status: 403 });

  const { approvalThreshold } = await request.json();
  const value = Number(approvalThreshold);
  if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const { error } = await supabase.from("dealerships").update({ approval_threshold: value }).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
