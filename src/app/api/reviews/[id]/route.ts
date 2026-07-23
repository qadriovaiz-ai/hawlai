import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

// Moderation only — hide/unhide or delete an inappropriate review.
// Never lets a dealer edit the rating/comment/customer_name, so a
// visible review always reflects what the customer actually wrote.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { isHidden } = await request.json();
  if (typeof isHidden !== "boolean") return NextResponse.json({ error: "isHidden must be a boolean" }, { status: 400 });

  const { data: review, error } = await supabase
    .from("reviews")
    .update({ is_hidden: isHidden })
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Couldn't update review" }, { status: 500 });
  return NextResponse.json({ review });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { error } = await supabase.from("reviews").delete().eq("id", id).eq("dealership_id", dealershipId);
  if (error) return NextResponse.json({ error: "Couldn't delete review" }, { status: 500 });
  return NextResponse.json({ success: true });
}
