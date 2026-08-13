import { createClient } from "@/lib/supabase/server";
import { normalizePhoneNumber } from "@/lib/whatsapp/gupshupClient";
import { requireFeature } from "@/lib/featureGate";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve via the active dealership, not an owner_id-only lookup —
  // that silently breaks (returns null) once the owner has 2+
  // businesses. See /api/team/route.ts for the full explanation. Using
  // the active business is also the correct behavior here regardless:
  // a multi-business owner connecting WhatsApp should connect it to
  // whichever business they currently have open.
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase.from("dealerships").select("id").eq("id", profile.dealership_id).eq("owner_id", user.id).maybeSingle()
    : { data: null };
  if (!dealership) return NextResponse.json({ error: "Only the owner can connect their own WhatsApp here" }, { status: 403 });

  const gate = await requireFeature(supabase, dealership.id, "whatsappAutomation");
  if (!gate.allowed) return gate.response;

  const { phoneNumber } = await request.json();
  if (!phoneNumber) return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  const normalized = normalizePhoneNumber(phoneNumber);

  // Clear any earlier pending request for this number so only the
  // latest "start" attempt is live — avoids stale codes lingering.
  await supabase.from("whatsapp_verification_codes").delete().eq("dealership_id", dealership.id).eq("phone_number", normalized).is("verified_at", null);

  await supabase.from("whatsapp_verification_codes").insert({
    dealership_id: dealership.id,
    team_member_id: null, // owner
    phone_number: normalized,
    code: "", // filled in once they message CONNECT — see the webhook
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });

  const sourceNumber = process.env.GUPSHUP_SOURCE_NUMBER ?? "the Hawlai WhatsApp number";
  return NextResponse.json({
    success: true,
    instruction: `Now send the word CONNECT (exactly that, nothing else) to ${sourceNumber} from this WhatsApp number. Hawlai will reply with a 6-digit code — enter it below.`,
  });
}
