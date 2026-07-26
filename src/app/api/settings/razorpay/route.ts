import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Never return the key secret to the client — only whether one is
  // set, and the key id (Razorpay's own publishable identifier, safe
  // to show/edit).
  const { data: dealership } = await supabase.from("dealerships").select("razorpay_key_id, razorpay_key_secret").eq("id", profile.dealership_id).single();
  return NextResponse.json({
    keyId: dealership?.razorpay_key_id ?? "",
    hasSecret: Boolean(dealership?.razorpay_key_secret),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { keyId, keySecret } = await request.json();
  const update: Record<string, any> = {};
  if (keyId !== undefined) update.razorpay_key_id = String(keyId).trim() || null;
  // Only overwrite the secret if a new one was actually typed — lets
  // the dealer update just the key id without being forced to
  // re-paste the secret every time.
  if (keySecret !== undefined && String(keySecret).trim()) update.razorpay_key_secret = String(keySecret).trim();

  const { error } = await supabase.from("dealerships").update(update).eq("id", profile.dealership_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
