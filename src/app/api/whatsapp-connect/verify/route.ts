import { createClient } from "@/lib/supabase/server";
import { normalizePhoneNumber } from "@/lib/whatsapp/gupshupClient";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dealership } = await supabase.from("dealerships").select("id").eq("owner_id", user.id).maybeSingle();
  if (!dealership) return NextResponse.json({ error: "Only the owner can connect their own WhatsApp here" }, { status: 403 });

  const { phoneNumber, code } = await request.json();
  if (!phoneNumber || !code) return NextResponse.json({ error: "Phone number and code required" }, { status: 400 });
  const normalized = normalizePhoneNumber(phoneNumber);

  const { data: pending } = await supabase
    .from("whatsapp_verification_codes")
    .select("id, code, expires_at")
    .eq("dealership_id", dealership.id)
    .eq("phone_number", normalized)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return NextResponse.json({ error: "No pending verification for this number — start again." }, { status: 400 });
  if (new Date(pending.expires_at) < new Date()) return NextResponse.json({ error: "This code expired — start again." }, { status: 400 });
  if (!pending.code) return NextResponse.json({ error: "Hawlai hasn't sent a code yet — make sure you messaged CONNECT first, then try again in a few seconds." }, { status: 400 });
  if (pending.code !== code.trim()) return NextResponse.json({ error: "That code doesn't match." }, { status: 400 });

  await supabase.from("whatsapp_verification_codes").update({ verified_at: new Date().toISOString() }).eq("id", pending.id);
  await supabase.from("dealerships").update({ owner_whatsapp_number: normalized, owner_whatsapp_verified: true }).eq("id", dealership.id);

  return NextResponse.json({ success: true });
}
