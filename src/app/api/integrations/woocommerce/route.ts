import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchWooCommerceProducts } from "@/lib/agents/woocommerceAgent";
import { woocommerceConsumerSecret, clearedWrite, WOOCOMMERCE_SECRET_SELECT } from "@/lib/crypto/commerceSecrets";
import { healthFromFailure, type Health } from "@/lib/integrations/healthState";
import { recordHealthAsService } from "@/lib/integrations/health";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase.from("dealerships").select(`woocommerce_store_url, woocommerce_consumer_key, ${WOOCOMMERCE_SECRET_SELECT}`).eq("id", dealershipId).single();
  const wooSecret = woocommerceConsumerSecret(data);
  const connected = !!(data?.woocommerce_store_url && data?.woocommerce_consumer_key);

  // WHAT THE CALL FOUND — 27 Nov 2026 (H0). The same discarded failure as
  // the Shopify route: "still report connected: true, just no products".
  // `connected` keeps meaning "stored"; `health` says whether it works.
  let products: any[] = [];
  let health: Health | null = null;
  if (connected) {
    if (!wooSecret) {
      health = { state: "needs_reconnect", reason: "the stored WooCommerce key could not be read" };
    } else {
      try {
        products = await fetchWooCommerceProducts(data!.woocommerce_store_url!, data!.woocommerce_consumer_key!, wooSecret);
        health = { state: "working", reason: null };
      } catch (err: any) {
        health = healthFromFailure(err?.message);
      }
    }
  }

  // WHAT IT FOUND IS RECORDED (H1), so the Integrations page, the daily
  // run and the owner's notification all read one answer.
  if (health) await recordHealthAsService(dealershipId, "woocommerce", health);

  return NextResponse.json({ connected, storeUrl: data?.woocommerce_store_url ?? null, products, health });
}

// The POST that took a pasted store URL, consumer key and consumer
// secret is GONE, replaced by the /wc-auth/v1/authorize handshake in
// ./start and ./callback (A6). Deleted rather than left in place: it
// was unreachable from the UI the moment the new flow landed, and an
// endpoint that accepts credentials over the wire should not outlive
// the screen that fed it — dead auth surface is the kind of thing that
// gets rediscovered later and assumed to be load-bearing.
//
// GET and DELETE remain: both are still used by the settings card.

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  await supabase.from("dealerships").update({
    woocommerce_store_url: null, woocommerce_consumer_key: null,
    ...clearedWrite("woocommerce_consumer_secret"),
  }).eq("id", dealershipId);
  return NextResponse.json({ success: true });
}
