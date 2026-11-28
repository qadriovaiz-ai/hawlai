// The seller messages the customer of an Instagram order — O5 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026 ("telling the
// customer is a seller-tapped message, because it is usually outside the
// 24 hours").
//
// GET says what Meta allows right now and offers a draft for the order's
// status (shipped / delivered), written by code. POST sends what the
// seller wrote — the draft or their own words — through
// lib/dm/sellerMessage.ts, the one place the HUMAN_AGENT tag is set.
//
// THE OWNER PRESSING SEND ON THEIR OWN DASHBOARD IS THE DECISION, as with
// every other control on this tab. Registered as `dm_human_message`.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { readDmThread } from "@/lib/dm/thread";
import { orderUpdateDraft, reachFor, sendSellerMessage } from "@/lib/dm/sellerMessage";
import { orderReference } from "@/lib/payments/upiRequest";
import { businessDisplayName } from "@/lib/business/displayName";
import { normaliseLanguage } from "@/lib/content/language";

type Owned = { ok: false; response: NextResponse } | { ok: true; dealershipId: string; order: any };

async function ownedInstagramOrder(id: string): Promise<Owned> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return { ok: false, response: NextResponse.json({ error: "No dealership" }, { status: 400 }) };
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, channel, status, instagram_sender_id, upi_reference")
    .eq("id", id)
    .eq("dealership_id", dealershipId)
    .maybeSingle();
  if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!order) return { ok: false, response: NextResponse.json({ error: "Order not found" }, { status: 404 }) };
  if (order.channel !== "instagram") return { ok: false, response: NextResponse.json({ error: "Only Instagram orders are messaged from here." }, { status: 400 }) };
  return { ok: true, dealershipId, order };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedInstagramOrder(id);
  if (!found.ok) return found.response;
  const { dealershipId, order } = found;

  const service = createServiceClient();
  const [thread, { data: business }, { data: brand }] = await Promise.all([
    order.instagram_sender_id ? readDmThread(service, dealershipId, "instagram", order.instagram_sender_id) : Promise.resolve({ lastCustomerAt: null }),
    service.from("dealerships").select("dealership_name").eq("id", dealershipId).maybeSingle(),
    service.from("brand_profiles").select("preferred_language").eq("dealership_id", dealershipId).maybeSingle(),
  ]);
  const reach = reachFor((thread as any).lastCustomerAt, new Date());
  const draft = orderUpdateDraft(
    order.status,
    order.upi_reference || orderReference(order.id),
    businessDisplayName(business?.dealership_name),
    normaliseLanguage(brand?.preferred_language)
  );
  return NextResponse.json({ mode: reach.mode, why: reach.mode === "closed" ? reach.why : null, draft });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await ownedInstagramOrder(id);
  if (!found.ok) return found.response;
  const body = await request.json().catch(() => ({}));
  const sent = await sendSellerMessage(createServiceClient(), found.dealershipId, String(found.order.instagram_sender_id ?? ""), body?.text);
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });
  return NextResponse.json({
    sent: true,
    mode: sent.mode,
    note: sent.mode === "human_agent" ? "Sent. The customer last wrote over a day ago, so Instagram allowed it as a message from you personally." : "Sent.",
  });
}
