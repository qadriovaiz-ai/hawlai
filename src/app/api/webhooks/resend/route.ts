import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Resend's webhook — configured once in the Resend dashboard to point
// here. No signature verification (matches this repo's existing
// webhook convention — see /api/webhooks/vapi) — a real hardening step
// if this ever needs it is checking the `svix-signature` header Resend
// sends, using the webhook secret from the Resend dashboard.
export async function POST(request: Request) {
  const body = await request.json();
  const type = body?.type as string | undefined;
  const messageId = body?.data?.email_id as string | undefined;
  if (!messageId) return NextResponse.json({ received: true });

  const supabase = createServiceClient();
  const { data: existing } = await supabase.from("email_sends").select("id, open_count, click_count").eq("resend_message_id", messageId).maybeSingle();
  if (!existing) return NextResponse.json({ received: true }); // event for a send we didn't log (e.g. sent outside Hawlai) — nothing to update

  const now = new Date().toISOString();
  if (type === "email.opened") {
    await supabase.from("email_sends").update({ opened: true, open_count: existing.open_count + 1, last_event_at: now }).eq("id", existing.id);
  } else if (type === "email.clicked") {
    await supabase.from("email_sends").update({ clicked: true, click_count: existing.click_count + 1, last_event_at: now }).eq("id", existing.id);
  }

  return NextResponse.json({ received: true });
}
