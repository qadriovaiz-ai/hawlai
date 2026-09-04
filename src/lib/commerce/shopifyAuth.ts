// Shopify OAuth — Group B, now that the public app is registered.
//
// Replaces: "Settings → Apps → Develop apps → Create an app → give it
// Products read access → install → copy the Admin API access token",
// plus pasting a shpat_... into a password field. The dealer now
// enters their store domain and approves on Shopify.
//
// TWO CHECKS HERE ARE LOAD-BEARING, and both are places where Shopify
// OAuth integrations are routinely broken:
//
// 1. THE SHOP DOMAIN MUST BE VALIDATED BEFORE IT IS USED IN A URL.
//    The token exchange POSTs our client_id AND client_secret to
//    https://{shop}/admin/oauth/access_token. `shop` arrives in the
//    callback query string, from the browser. If it is taken on
//    trust, an attacker sends shop=evil.example and we hand them the
//    app's client secret directly. This is the single most common
//    Shopify OAuth vulnerability, and the mitigation is a strict
//    allowlist pattern on *.myshopify.com — not a substring check,
//    which "evil.com/?x=.myshopify.com" would pass.
//
// 2. THE HMAC MUST BE VERIFIED, IN CONSTANT TIME. Shopify signs the
//    callback query string with the app's client secret. Without it,
//    anyone can invent a callback. The signing rule is specific: drop
//    `hmac`, sort the remaining parameters, join as key=value pairs
//    with &, then HMAC-SHA256.
//
// The `state` nonce is a third check, and it is not a substitute for
// either of the above — it ties the callback to a business, while the
// HMAC proves Shopify sent it.

import crypto from "crypto";
import { isValidNonceFormat } from "./connectHandshake";

export { createHandshakeNonce as createShopifyNonce, isHandshakeFresh as isShopifyPendingFresh } from "./connectHandshake";

/** Products read is all this product needs — see shopifyAgent.ts. */
export const SHOPIFY_SCOPES = "read_products";

export const SHOPIFY_API_VERSION = "2024-01";

export type ShopDomainResult = { ok: true; shop: string } | { ok: false; reason: string };

/**
 * A dealer's typed store address turned into a verified
 * `something.myshopify.com` domain.
 *
 * Anchored pattern, no substrings, no user-controlled path. Everything
 * downstream builds URLs from this value.
 */
export function normaliseShopDomain(input: string | null | undefined): ShopDomainResult {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return { ok: false, reason: "Enter your Shopify store address." };

  // Accept a pasted URL as well as a bare domain — dealers copy the
  // address bar. Anything after the host is discarded rather than
  // cleaned, because none of it can be trusted or is needed.
  let host = raw;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return { ok: false, reason: "That doesn't look like a Shopify store address." };
  }

  // The whole check. Anchored at both ends: a store handle is
  // letters, digits and hyphens, not starting or ending with one.
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]\.myshopify\.com$/.test(host) && !/^[a-z0-9]\.myshopify\.com$/.test(host)) {
    return {
      ok: false,
      reason: "Use your .myshopify.com address — you'll find it in Shopify under Settings → Domains.",
    };
  }

  return { ok: true, shop: host };
}

/** Where to send the dealer to approve the app. */
export function buildInstallUrl(opts: { shop: string; clientId: string; nonce: string; redirectUri: string }): string {
  const url = new URL(`https://${opts.shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("scope", SHOPIFY_SCOPES);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.nonce);
  return url.toString();
}

/**
 * Shopify's HMAC over the callback query string.
 *
 * The rule is exact and unforgiving: remove `hmac`, sort the remaining
 * keys, join `key=value` with `&`, sign with the app secret. Any
 * deviation — leaving hmac in, sorting wrong, re-encoding a value —
 * produces a mismatch that looks like an attack.
 */
export function verifyShopifyHmac(params: URLSearchParams, clientSecret: string): boolean {
  const provided = params.get("hmac");
  if (!provided) return false;

  const message = Array.from(params.entries())
    .filter(([key]) => key !== "hmac")
    .map(([key, value]) => [key, value] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const expected = crypto.createHmac("sha256", clientSecret).update(message, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  // timingSafeEqual throws on a length mismatch — required for
  // correctness, not speed. Same note as metaSignature.ts.
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export type CallbackCheck =
  | { ok: true; shop: string; code: string; nonce: string }
  | { ok: false; reason: string };

/**
 * Everything that must hold before a callback is acted on, in one
 * place so the route reads as a sequence of decisions rather than a
 * pile of conditionals.
 *
 * Order matters: cheap shape checks first, HMAC before anything is
 * trusted, and the shop domain validated before it is ever used to
 * build the token-exchange URL.
 */
export function checkCallback(params: URLSearchParams, clientSecret: string): CallbackCheck {
  const nonce = params.get("state");
  const code = params.get("code");

  if (!isValidNonceFormat(nonce)) return { ok: false, reason: "invalid_state" };
  if (!code) return { ok: false, reason: "missing_code" };

  // Before the domain check, because a forged callback should be
  // rejected as forged rather than as a bad domain.
  if (!verifyShopifyHmac(params, clientSecret)) return { ok: false, reason: "bad_hmac" };

  const shop = normaliseShopDomain(params.get("shop"));
  if (!shop.ok) return { ok: false, reason: "invalid_shop" };

  return { ok: true, shop: shop.shop, code, nonce };
}
