import { createClient } from "@/lib/supabase/server";
import { normalizePhoneNumber } from "@/lib/whatsapp/gupshupClient";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve via the active dealership — see /api/team/route.ts for why
  // an owner_id-only lookup breaks for a 2+ business owner.
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
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

  // THE OLD NUMBER'S CONVERSATION GOES WITH THE OLD NUMBER — H4.
  //
  // Changing the number already stops the old one being recognised,
  // because the lookup is on `owner_whatsapp_number`. What it did NOT
  // do was remove the session: `whatsapp_chat_sessions` is keyed on
  // the phone number, so the old row sat there holding the history of
  // a connection that no longer exists.
  //
  // It is unreachable while nothing matches it, and that is exactly
  // the problem with leaving it: a carrier reassigns numbers, and the
  // next person to connect that handset would pick up a conversation
  // about somebody else's business. History belongs to the connection.
  const { data: before } = await supabase
    .from("dealerships")
    .select("owner_whatsapp_number")
    .eq("id", dealership.id)
    .maybeSingle();
  const previous = String(before?.owner_whatsapp_number ?? "").trim();
  if (previous && previous !== normalized) {
    const { error: sessionError } = await supabase.from("whatsapp_chat_sessions").delete().eq("phone_number", previous);
    if (sessionError) {
      // Not fatal: the number is about to stop being recognised either
      // way, so the connection is still correctly replaced.
      console.error(`[whatsapp-connect] left the previous session behind for ${dealership.id}: ${sessionError.message}`);
    }
  }

  await supabase.from("dealerships").update({ owner_whatsapp_number: normalized, owner_whatsapp_verified: true }).eq("id", dealership.id);

  return NextResponse.json({ success: true });
}
