import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { checkCallback, isShopifyPendingFresh, SHOPIFY_API_VERSION } from "@/lib/commerce/shopifyAuth";
import { encryptedWrite } from "@/lib/crypto/commerceSecrets";

// Shopify OAuth step 2 — Shopify redirects the dealer's BROWSER here
// with a code, an hmac and a shop.
//
// Unlike the WooCommerce callback this is a GET carrying a real user,
// so it redirects to the settings page with a result rather than
// answering JSON. It still cannot rely on a session: the dealer may
// have approved in a different browser context, and the security of
// the flow must not depend on a cookie surviving a third-party
// redirect. The three checks in checkCallback are what make it safe.
const settings = (origin: string, params: string) => NextResponse.redirect(`${origin}/dashboard/settings/integrations?${params}`);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return settings(origin, "shopify_error=not_configured");

  // HMAC, state format and shop domain — in that order, and all before
  // the shop value is used to build any URL.
  const check = checkCallback(url.searchParams, clientSecret);
  if (!check.ok) return settings(origin, `shopify_error=${check.reason}`);

  const service = createServiceClient();
  const { data: dealership } = await service
    .from("dealerships")
    .select("id, shopify_connect_pending")
    .eq("shopify_connect_pending->>nonce", check.nonce)
    .maybeSingle();

  const pending = dealership?.shopify_connect_pending as { shop?: string; created_at?: string } | null;
  if (!dealership || !pending?.shop) return settings(origin, "shopify_error=unknown_request");

  if (!isShopifyPendingFresh(pending.created_at)) {
    await service.from("dealerships").update({ shopify_connect_pending: null }).eq("id", dealership.id);
    return settings(origin, "shopify_error=expired");
  }

  // The shop that came back must be the one the dealer started from.
  // A valid, correctly-signed callback for a DIFFERENT store would
  // otherwise be accepted here and connect the wrong shop.
  if (pending.shop !== check.shop) {
    await service.from("dealerships").update({ shopify_connect_pending: null }).eq("id", dealership.id);
    return settings(origin, "shopify_error=shop_mismatch");
  }

  try {
    // check.shop is pattern-validated *.myshopify.com, which is what
    // makes it safe to post the client secret to.
    const tokenRes = await fetch(`https://${check.shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: check.code }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData?.access_token) {
      return settings(origin, "shopify_error=token_exchange_failed");
    }

    // Confirm the token works before reporting success, so a dealer
    // never lands on "Connected" over a credential that returns
    // nothing.
    const shopRes = await fetch(`https://${check.shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": tokenData.access_token },
    });
    if (!shopRes.ok) return settings(origin, "shopify_error=token_rejected");

    await service
      .from("dealerships")
      .update({
        shopify_store_url: check.shop,
        ...encryptedWrite("shopify_access_token", tokenData.access_token),
        // Same write, so the nonce cannot be replayed.
        shopify_connect_pending: null,
      })
      .eq("id", dealership.id);

    return settings(origin, "shopify=connected");
  } catch {
    return settings(origin, "shopify_error=network");
  }
}
