import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  checkCallback,
  isShopifyPendingFresh,
  missingScopes,
  SHOPIFY_API_VERSION,
  SHOPIFY_SCOPES,
} from "@/lib/commerce/shopifyAuth";
import { refreshedWrite } from "@/lib/commerce/shopifyToken";

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
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: check.code,
        // THE FIX. Without this Shopify issues a NON-EXPIRING token,
        // which it accepts at issue time and then refuses on every
        // Admin API call with "[API] Non-expiring access tokens are no
        // longer accepted for the Admin API." New public apps have
        // been required to use expiring offline tokens since 1 April
        // 2026; all public apps from 1 January 2027.
        //
        // This is why the failure read as a permissions problem for
        // three rounds: OAuth completed, a token existed, and nothing
        // broke until the token was USED.
        expiring: 1,
      }),
    });
    // Read the body as TEXT first, then parse.
    //
    // `await tokenRes.json()` throws on any non-JSON body, and that
    // throw landed in the bare catch at the bottom of this function —
    // which reported "network" and logged NOTHING. A reconnect
    // produced a failure with no server-side trace at all, and the
    // body Shopify actually sent, the one thing that would have
    // explained it, was discarded by the parse that failed.
    //
    // This is the third time in this integration that the evidence was
    // thrown away: the granted scope went unread, then the verify
    // response body, now this. Keeping the raw text costs nothing and
    // is the difference between diagnosing and guessing.
    const rawBody = await tokenRes.text().catch(() => "");
    let tokenData: any = null;
    try {
      tokenData = JSON.parse(rawBody);
    } catch {
      console.error(
        `[shopify-callback] token exchange returned non-JSON for ${check.shop} status=${tokenRes.status} body=${rawBody.slice(0, 400)}`
      );
      return settings(origin, "shopify_error=token_exchange_unparseable");
    }

    if (!tokenRes.ok || !tokenData?.access_token) {
      // Shopify's own message, which names the reason — an invalid
      // code, a rejected parameter, a client_id mismatch.
      console.error(
        `[shopify-callback] token exchange failed for ${check.shop} status=${tokenRes.status} body=${rawBody.slice(0, 400)}`
      );
      return settings(origin, "shopify_error=token_exchange_failed");
    }

    // A response with no refresh_token means `expiring=1` did not take
    // effect, so Shopify has issued a NON-EXPIRING token — the exact
    // credential it refuses on every Admin API call. Storing it would
    // recreate the bug this change exists to fix, and would look like
    // a successful connection until the first product fetch.
    //
    // Fail the connect instead. A merchant who cannot connect will say
    // so; a merchant who connects to a dead token will not, and
    // neither will anything in the logs.
    if (!tokenData.refresh_token) {
      console.error(
        `[shopify-callback] no refresh_token for ${check.shop} — expiring=1 did not take effect, refusing to store a non-expiring token`
      );
      return settings(origin, "shopify_error=non_expiring_token");
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
    // missingScopes, not a plain includes(): write_products covers
    // read_products, and Shopify omits the implied read scope from
    // the granted list. A literal membership test rejected a
    // completely valid grant here on 2026-09-04.
    const missing = missingScopes(SHOPIFY_SCOPES, grantedScope);

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
      const reason = verifyRes.status === 403 ? "products_forbidden" : "token_rejected";
      // The granted scope and the status ride along, for the same
      // reason they do on the scope-check path above.
      //
      // WHY THIS RENAME. The old code was `missing_scope`, whose UI
      // string said "isn't allowed to read your products yet" — near
      // enough to the scope-check path's message that the two were
      // indistinguishable on screen. When the scope-check fix landed
      // and the flow got FURTHER, reaching this branch for the first
      // time, the unchanged wording looked exactly like a stale
      // deploy, and a working fix was read as a build that had not
      // shipped. Two different failures must never present the same
      // sentence.
      return settings(
        origin,
        `shopify_error=${reason}&granted=${encodeURIComponent(grantedScope || "none")}&status=${verifyRes.status}`
      );
    }

    await service
      .from("dealerships")
      .update({
        shopify_store_url: check.shop,
        // All four values, together. An expiring token is useless
        // without its refresh token, and the refresh token is useless
        // without knowing when either expires — storing the access
        // token alone would work for exactly 60 minutes and then
        // strand the connection with no way back but a reconnect.
        ...refreshedWrite({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: Number(tokenData.expires_in) || 3600,
          refresh_token_expires_in: Number(tokenData.refresh_token_expires_in) || 7776000,
        }),
        // Same write, so the nonce cannot be replayed.
        shopify_connect_pending: null,
      })
      .eq("id", dealership.id);

    return settings(origin, "shopify=connected");
  } catch (err: any) {
    // THE ERROR IS NOW BOUND AND LOGGED. It was `catch {` — no
    // binding, no logging — so any exception in this whole block
    // surfaced to the merchant as "Couldn't reach Shopify" and left
    // NOTHING server-side. A reconnect failed with zero trace, which
    // is worse than a crash: a crash at least leaves a stack.
    //
    // "network" was also a lie for most of what lands here. A fetch
    // failure is one possibility; an encryption key missing, a
    // malformed response, a bug in this code are others, and they are
    // not the merchant's connection.
    //
    // The message and stack only — never `err` wholesale, which for a
    // fetch failure can carry the request including the client secret.
    console.error(
      `[shopify-callback] UNCAUGHT for ${check.shop}: ${err?.name ?? "Error"}: ${err?.message ?? String(err)}`
    );
    if (err?.stack) console.error(`[shopify-callback] stack: ${String(err.stack).slice(0, 800)}`);
    return settings(origin, "shopify_error=unexpected");
  }
}
