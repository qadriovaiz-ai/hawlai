import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealershipId } = await request.json();
  if (!dealershipId) return NextResponse.json({ error: "dealershipId required" }, { status: 400 });

  // Only allow switching into a business this user actually owns.
  const { data: business } = await supabase.from("dealerships").select("id").eq("id", dealershipId).eq("owner_id", user.id).maybeSingle();
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { error } = await supabase.from("profiles").update({ dealership_id: dealershipId }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
