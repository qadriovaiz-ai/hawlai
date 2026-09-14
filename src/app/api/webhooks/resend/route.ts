import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { applyResendEvent, verifyResendEvent } from "@/lib/email/resendWebhook";

// Resend's webhook — registered by Hawlai itself (ensureResendWebhook,
// run daily). Every request's signature is checked before anything is
// recorded: an unverified "bounced" event would unsubscribe a real
// customer. See lib/email/resendWebhook.ts.
export async function POST(request: Request) {
  const raw = await request.text();
  const event = await verifyResendEvent(raw, request.headers);
  if (!event) {
    console.error("[resend-webhook] rejected an event whose signature couldn't be verified");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  try {
    const result = await applyResendEvent(createServiceClient(), event);
    return NextResponse.json({ received: true, ...result });
  } catch (err: any) {
    // A 5xx makes Resend retry, rather than the event being lost.
    console.error("[resend-webhook] couldn't apply event:", err.message);
    return NextResponse.json({ error: "couldn't record the event" }, { status: 500 });
  }
}
