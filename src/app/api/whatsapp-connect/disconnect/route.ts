import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Turning WhatsApp control off — H4.
//
// There was `start` and `verify` and nothing to undo them. A number
// stayed verified until somebody edited the database, which is not a
// thing the owner can do — so "I've lost that phone" had no answer.
//
// ─────────────────────────────────────────────────────────────────────
// ONLY FROM THE DASHBOARD, AND THAT IS THE POINT
// ─────────────────────────────────────────────────────────────────────
//
// There is deliberately NO "disconnect" command over WhatsApp. If
// somebody is holding the phone, a WhatsApp-triggered lockout is as
// available to them as it is to the owner — and the one moment
// revocation matters is the moment the phone is in the wrong hands.
// Behind a session, it is the owner and nobody else.
//
// THE SESSION GOES WITH THE CONNECTION. `whatsapp_chat_sessions` keeps
// the conversation history keyed on the phone number. Leaving it
// behind would mean a number reconnected later — or a number reassigned
// by a carrier to a stranger — picking up a conversation about somebody
// else's business. History belongs to the connection, not to the
// handset.
//
// SWITCHING SOMETHING OFF IS NEVER THE SLOW PATH. No confirmation
// step, no second screen: the safe direction must not be the difficult
// one, which is the same rule that keeps automation toggles ungated.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolved exactly as `verify` resolves it: through the active
  // dealership AND an owner check, because an owner_id-only lookup
  // breaks for somebody who runs more than one business.
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const { data: dealership } = profile?.dealership_id
    ? await supabase
        .from("dealerships")
        .select("id, owner_whatsapp_number")
        .eq("id", profile.dealership_id)
        .eq("owner_id", user.id)
        .maybeSingle()
    : { data: null };
  if (!dealership) {
    return NextResponse.json({ error: "Only the owner can disconnect their own WhatsApp here" }, { status: 403 });
  }

  const number = String(dealership.owner_whatsapp_number ?? "").trim();

  // The service client for the writes, after the session has
  // established who is asking — the order every writer in this area
  // uses.
  const service = createServiceClient();

  // THE FLAG AND THE NUMBER BOTH GO. Clearing only the flag would
  // leave the number on the row, and the next reader to check one
  // without the other would let a disconnected phone back in.
  const { error } = await service
    .from("dealerships")
    .update({ owner_whatsapp_number: null, owner_whatsapp_verified: false })
    .eq("id", dealership.id);
  if (error) {
    return NextResponse.json({ error: "Couldn't disconnect just now — nothing was changed." }, { status: 500 });
  }

  // The conversation goes with it. Not fatal if it fails: the number
  // is already disconnected, so nothing can reach that session anyway.
  if (number) {
    const { error: sessionError } = await service.from("whatsapp_chat_sessions").delete().eq("phone_number", number);
    if (sessionError) {
      console.error(`[whatsapp-disconnect] left a session behind for ${dealership.id}: ${sessionError.message}`);
    }
  }

  // ANY HALF-FINISHED CONNECTION GOES TOO. A pending code for this
  // business is an invitation that outlives the thing it was invited
  // to — and `CONNECT` would answer it.
  await service.from("whatsapp_verification_codes").delete().eq("dealership_id", dealership.id).is("verified_at", null);

  return NextResponse.json({ success: true });
}
