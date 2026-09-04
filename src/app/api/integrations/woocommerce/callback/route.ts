import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { validateCallbackPayload, isPendingFresh } from "@/lib/commerce/wooAuth";
import { testWooCommerceConnection } from "@/lib/agents/woocommerceAgent";
import { encryptedWrite } from "@/lib/crypto/commerceSecrets";

// A6 step 2 — WooCommerce POSTs the dealer's credentials here.
//
// THIS ROUTE IS UNAUTHENTICATED AND CANNOT BE OTHERWISE. WooCommerce
// calls it server-to-server from the dealer's own store, with no
// session and no signature — the flow has no shared secret to sign
// with, because there is no app registration. Everything that makes
// this safe is below, so it is all spelled out:
//
//   1. The 256-bit nonce in `user_id` is the only authenticator. It is
//      generated per attempt, never returned to the client, and is the
//      sole link between this POST and a dealership.
//   2. Shape-checked before the lookup, so probing traffic never
//      reaches the database.
//   3. Single-use: the pending record is cleared in the same write
//      that stores the credentials.
//   4. Expiring: 15 minutes, checked against created_at.
//   5. The credentials are TESTED against the store URL the dealer
//      themselves entered — not one supplied in this request. A
//      caller cannot make us store keys for an arbitrary host.
//
// It always answers 200. WooCommerce shows the dealer a failure page
// on a non-2xx, and there is no useful action for them in "your
// authorization reference was invalid" — while a distinguishable
// error would confirm to a prober which nonces exist.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const check = validateCallbackPayload(body);
  if (!check.ok) return NextResponse.json({ success: true });

  const { nonce, consumerKey, consumerSecret } = check.payload;

  // Service client: there is no user session on this request. The
  // nonce is what scopes the write, in place of RLS.
  const service = createServiceClient();
  const { data: dealership } = await service
    .from("dealerships")
    .select("id, woocommerce_connect_pending")
    .eq("woocommerce_connect_pending->>nonce", nonce)
    .maybeSingle();

  const pending = dealership?.woocommerce_connect_pending as { store_url?: string; created_at?: string } | null;
  if (!dealership || !pending?.store_url) return NextResponse.json({ success: true });

  if (!isPendingFresh(pending.created_at)) {
    // Clear it rather than leaving a dead nonce sitting in the row.
    await service.from("dealerships").update({ woocommerce_connect_pending: null }).eq("id", dealership.id);
    return NextResponse.json({ success: true });
  }

  // Verify the keys actually work before storing them. A dealer who
  // approved on a store that then refuses the key should not end up
  // "connected" with credentials that silently return nothing.
  const test = await testWooCommerceConnection(pending.store_url, consumerKey, consumerSecret);
  if (!test.success) {
    await service.from("dealerships").update({ woocommerce_connect_pending: null }).eq("id", dealership.id);
    return NextResponse.json({ success: true });
  }

  await service
    .from("dealerships")
    .update({
      woocommerce_store_url: pending.store_url,
      woocommerce_consumer_key: consumerKey,
      ...encryptedWrite("woocommerce_consumer_secret", consumerSecret),
      // Same write, so the nonce cannot be replayed.
      woocommerce_connect_pending: null,
    })
    .eq("id", dealership.id);

  return NextResponse.json({ success: true });
}
