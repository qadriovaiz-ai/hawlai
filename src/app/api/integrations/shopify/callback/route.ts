import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { checkCallback, isShopifyPendingFresh, SHOPIFY_API_VERSION, SHOPIFY_SCOPES } from "@/lib/commerce/shopifyAuth";
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

    // WHAT SHOPIFY ACTUALLY GRANTED. This was being discarded, which
    // is why the first two diagnoses were guesses: the exchange
    // response carries the granted scope, and without reading it the
    // only evidence available was a 403, which says what a token
    // LACKS and never what it has. Inferring "the token has
    // read_products" from "the token lacks read_shop" was invalid,
    // and it sent the investigation down the wrong path.
    //
    // Costs no extra request. Should have been here from the start.
    const grantedScope: string = typeof tokenData.scope === "string" ? tokenData.scope : "";
    const grantedList = grantedScope.split(",").map((s) => s.trim()).filter(Boolean);
    const requested = SHOPIFY_SCOPES.split(",").map((s) => s.trim()).filter(Boolean);
    const missing = requested.filter((s) => !grantedList.includes(s));

    // Server-side, so it survives regardless of where the redirect
    // lands. Never logs the token itself.
    console.error(
      `[shopify-callback] shop=${check.shop} granted="${grantedScope || "(none)"}" requested="${SHOPIFY_SCOPES}" missing="${missing.join(",") || "(none)"}"`
    );

    if (missing.length > 0) {
      // Distinguishes "Shopify granted something other than what we
      // asked for" from "our probe hit the wrong resource" — the two
      // failures that have so far been indistinguishable from the
      // outside. `granted` is not secret and is the single most
      // useful fact for whoever debugs this next.
      return settings(
        origin,
        `shopify_error=scope_not_granted&granted=${encodeURIComponent(grantedScope || "none")}`
      );
    }

    // Confirm the token works before reporting success, so a dealer
    // never lands on "Connected" over a credential that returns
    // nothing.
    //
    // VERIFY WITH THE RESOURCE WE ACTUALLY ASKED FOR. This was
    // shop.json, which cost a real connect attempt: shop.json needs
    // `read_shop`, we request only `read_products`, so Shopify
    // returned 403 on a PERFECTLY VALID token. OAuth had fully
    // succeeded — HMAC verified, code exchanged, token issued — and
    // the dealer was told their access was refused, by a health check
    // probing a resource the app had never asked to see.
    //
    // products.json is the right probe for the same reason shop.json
    // was the wrong one: it is exactly the capability this product
    // needs, so a pass here means the integration genuinely works,
    // and a failure is a real failure rather than an artefact of the
    // check. limit=1 because nothing here needs the data.
    const verifyRes = await fetch(`https://${check.shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=1`, {
      headers: { "X-Shopify-Access-Token": tokenData.access_token },
    });
    if (!verifyRes.ok) {
      // Shopify names the offending scope in the body. Discarding it
      // was the other half of debugging blind.
      const detail = await verifyRes.text().catch(() => "");
      console.error(
        `[shopify-callback] verify failed shop=${check.shop} status=${verifyRes.status} granted="${grantedScope}" body=${detail.slice(0, 300)}`
      );
      // 401 and 403 mean different things to whoever has to fix it:
      // a rejected token versus a token that is fine but not
      // permitted. Collapsing them is what made this bug take a live
      // attempt to find.
      const reason = verifyRes.status === 403 ? "missing_scope" : "token_rejected";
      return settings(origin, `shopify_error=${reason}`);
    }

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
