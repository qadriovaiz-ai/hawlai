import { createClient } from "@/lib/supabase/server";
import { instagramTokenWrite, instagramTokenClear } from "@/lib/crypto/oauthSecrets";
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

  const { data } = await supabase.from("dealerships").select("instagram_business_id").eq("id", dealershipId).single();
  return NextResponse.json({ connected: !!data?.instagram_business_id, instagramBusinessId: data?.instagram_business_id ?? null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { instagramBusinessId, accessToken } = await request.json();
  if (!instagramBusinessId?.trim() || !accessToken?.trim()) {
    return NextResponse.json({ error: "Both Instagram Business ID and access token are required" }, { status: 400 });
  }

  const { error } = await supabase.from("dealerships").update({
    instagram_business_id: instagramBusinessId.trim(),
    // Encrypted (F3). A pasted token's expiry is unknown, so the daily
    // refresh treats it as due.
    ...instagramTokenWrite(accessToken.trim(), null),
  }).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { error } = await supabase.from("dealerships").update({ instagram_business_id: null, ...instagramTokenClear() }).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
