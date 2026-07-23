import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { contacted } = await request.json();
  if (typeof contacted !== "boolean") return NextResponse.json({ error: "contacted must be a boolean" }, { status: 400 });

  const { data: cart, error } = await supabase
    .from("abandoned_carts")
    .update({ contacted })
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Couldn't update" }, { status: 500 });
  return NextResponse.json({ cart });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { error } = await supabase.from("abandoned_carts").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: "Couldn't delete" }, { status: 500 });
  return NextResponse.json({ success: true });
}
