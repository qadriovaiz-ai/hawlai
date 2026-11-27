import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchShopifyProducts } from "@/lib/agents/shopifyAgent";
import { shopifyAccessToken, clearedWrite, SHOPIFY_TOKEN_SELECT } from "@/lib/crypto/commerceSecrets";
import { getValidShopifyAccessToken } from "@/lib/commerce/shopifyToken";
import { healthFromFailure, type Health } from "@/lib/integrations/healthState";
import { recordHealthAsService } from "@/lib/integrations/health";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data } = await supabase
    .from("dealerships")
    .select(`id, shopify_store_url, ${SHOPIFY_TOKEN_SELECT}`)
    .eq("id", dealershipId)
    .single();
  const connected = !!(data?.shopify_store_url && shopifyAccessToken(data));

  // WHAT THE CALL FOUND, NOT ONLY WHAT IS STORED — 27 Nov 2026 (H0 of
  // docs/AUDIT-INTEGRATION-HEALTH.md). This route already made a real
  // call to Shopify, and on failure its comment said "still report
  // connected: true, just no products" — so a dead store read as
  // Connected with nothing in it. `connected` keeps meaning "a
  // connection is stored"; `health` says whether it works.
  let products: any[] = [];
  let health: Health | null = null;
  if (connected) {
    // Never the stored token directly — expiring offline tokens live
    // 60 minutes, so a token read straight from the row is very likely
    // already dead.
    const token = await getValidShopifyAccessToken(supabase, data as any, data!.shopify_store_url!);
    if (!token.ok) {
      // BUSY IS NOT BROKEN: another request was refreshing the token at
      // the same moment. Saying "reconnect" for that would send the
      // owner to fix something that is fine.
      health = token.reason === "busy"
        ? { state: "unchecked", reason: "the connection was being refreshed at the same moment — reload to check again" }
        : { state: "needs_reconnect", reason: token.detail ?? `Shopify could not renew access (${token.reason})` };
    } else {
      try {
        products = await fetchShopifyProducts(data!.shopify_store_url!, token.accessToken);
        health = { state: "working", reason: null };
      } catch (err: any) {
        health = healthFromFailure(err?.message);
      }
    }
  }

  // WHAT IT FOUND IS RECORDED (H1), so the Integrations page, the daily
  // run and the owner's notification all read one answer.
  if (health) await recordHealthAsService(dealershipId, "shopify", health);

  return NextResponse.json({ connected, storeUrl: data?.shopify_store_url ?? null, products, health });
}

// The POST that took a pasted store URL and Admin API token is GONE,
// replaced by the OAuth handshake in ./start and ./callback. Deleted
// rather than left unreachable, for the same reason as the WooCommerce
// one: an endpoint that accepts credentials over the wire should not
// outlive the screen that fed it.
//
// GET and DELETE remain — both are still used by the settings card.

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  await supabase.from("dealerships").update({ shopify_store_url: null, ...clearedWrite("shopify_access_token") }).eq("id", dealershipId);
  return NextResponse.json({ success: true });
}
