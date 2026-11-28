import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { normaliseVpa, sellerModeBlocker, SELLER_MODE_COLUMNS, SELLER_MODE_TAKES_ORDERS } from "@/lib/dm/sellerMode";

async function getDealership(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", userId).single();
  return profile?.dealership_id as string | undefined;
}

const COLUMNS = `fb_page_id, comment_auto_reply_enabled, ${SELLER_MODE_COLUMNS}`;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const [{ data: dealership, error }, { data: log }] = await Promise.all([
    supabase.from("dealerships").select(COLUMNS).eq("id", dealershipId).single(),
    supabase.from("auto_reply_log").select("*").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (error) return NextResponse.json({ error: `Couldn't read your settings: ${error.message}` }, { status: 500 });

  return NextResponse.json({
    dmEnabled: dealership?.dm_auto_reply_enabled ?? false,
    commentEnabled: dealership?.comment_auto_reply_enabled ?? false,
    sellingEnabled: dealership?.instagram_selling_enabled ?? false,
    upiVpa: dealership?.seller_upi_vpa ?? null,
    // EITHER ACCOUNT, F4 (28 Nov 2026). This used to be the Facebook Page
    // alone, so an Instagram-only business could never switch DM
    // auto-reply on — and Seller Mode is for exactly that business.
    instagramConnected: !!dealership?.instagram_business_id,
    facebookConnected: !!dealership?.fb_page_id,
    connected: !!(dealership?.instagram_business_id || dealership?.fb_page_id),
    takesOrders: SELLER_MODE_TAKES_ORDERS,
    log: log ?? [],
  });
}

/**
 * Change the switches and the UPI ID.
 *
 * The owner pressing a switch on their own dashboard IS the decision, as
 * it always was here. What is new is that Seller Mode is checked against
 * the state it would leave — so DM auto-reply and Seller Mode switched on
 * together pass, and Seller Mode alone without them does not.
 *
 * OFF IS NEVER REFUSED, and DM auto-reply off takes Seller Mode with it:
 * Seller Mode answers through DM replies, so leaving it on would leave a
 * switch that says one thing and does nothing.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealershipId = await getDealership(supabase, user.id);
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (body.upiVpa !== undefined) {
    // An empty box clears it — and Seller Mode with it, because there would
    // be nowhere for a customer to pay.
    if (body.upiVpa === null || String(body.upiVpa).trim() === "") {
      update.seller_upi_vpa = null;
      update.instagram_selling_enabled = false;
    } else {
      const vpa = normaliseVpa(body.upiVpa);
      if (!vpa.ok) return NextResponse.json({ error: vpa.reason }, { status: 400 });
      update.seller_upi_vpa = vpa.vpa;
    }
  }
  if (typeof body.dmEnabled === "boolean") {
    update.dm_auto_reply_enabled = body.dmEnabled;
    if (!body.dmEnabled) update.instagram_selling_enabled = false;
  }
  if (typeof body.commentEnabled === "boolean") update.comment_auto_reply_enabled = body.commentEnabled;
  if (typeof body.sellingEnabled === "boolean" && update.instagram_selling_enabled !== false) {
    update.instagram_selling_enabled = body.sellingEnabled;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  // ON IS CHECKED AGAINST THE STATE IT WOULD LEAVE.
  if (update.instagram_selling_enabled === true) {
    const { data: current, error: readError } = await supabase.from("dealerships").select(SELLER_MODE_COLUMNS).eq("id", dealershipId).single();
    if (readError) return NextResponse.json({ error: `Couldn't read your settings: ${readError.message}` }, { status: 500 });
    const blocker = sellerModeBlocker({ ...current, ...update });
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });
  }

  const { error } = await supabase.from("dealerships").update(update).eq("id", dealershipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
