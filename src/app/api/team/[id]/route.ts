import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function requireOwnerDealership(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: dealership } = await supabase.from("dealerships").select("id").eq("owner_id", user.id).maybeSingle();
  if (!dealership) return { error: NextResponse.json({ error: "Only the owner can manage the team" }, { status: 403 }) };
  return { dealership };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error, dealership } = await requireOwnerDealership(supabase);
  if (error) return error;

  const { role } = await request.json();
  const validRoles = ["admin", "marketing_manager", "designer", "content_writer", "sales", "viewer"];
  if (!validRoles.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const { error: updateError } = await supabase.from("team_members").update({ role }).eq("id", id).eq("dealership_id", dealership!.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error, dealership } = await requireOwnerDealership(supabase);
  if (error) return error;

  // Soft-remove — keeps task history intact rather than cascading a
  // hard delete through everything they were ever assigned.
  const { error: updateError } = await supabase.from("team_members").update({ status: "removed" }).eq("id", id).eq("dealership_id", dealership!.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
