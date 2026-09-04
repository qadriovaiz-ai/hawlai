// A6 — the dealer never types a WooCommerce key or secret.
//
// The old flow was three fields and an instruction: "wp-admin →
// WooCommerce → Settings → Advanced → REST API → Add key → Read access
// → generate", then copy a ck_... and a cs_... back. WooCommerce ships
// its own app-authorisation endpoint for exactly this, and unlike
// Shopify it needs NO app registration and no review: any store can
// authorise any app at /wc-auth/v1/authorize.
//
// The dealer supplies their own store address and nothing else. A
// store URL is not a credential — it is the address they type into a
// browser every day — so it stays a text field.
//
// THE SECURITY SHAPE OF THIS FLOW, because it is unusual and easy to
// get wrong: WooCommerce does not redirect the credentials back
// through the browser. It POSTs them server-to-server to a callback
// URL of our choosing, which therefore cannot require a logged-in
// session. That callback is reachable by anyone. The `user_id`
// parameter is an opaque string WooCommerce echoes back untouched, so
// it — and only it — is what ties a callback to a dealership. Using
// the dealership id there, the obvious choice, would let anyone who
// learned an id POST their own store's credentials and repoint that
// business's product feed. It has to be an unguessable single-use
// nonce with an expiry.

import { randomBytes } from "crypto";

export const WOO_NONCE_TTL_MS = 15 * 60 * 1000;

/** 256 bits of randomness — this is the entire authenticator for the callback. */
export function createWooNonce(): string {
  return randomBytes(32).toString("hex");
}

export type NormalisedStore = { ok: true; origin: string; host: string } | { ok: false; reason: string };

/**
 * A dealer's typed store address turned into something safe to build a
 * URL from and to fetch server-side.
 *
 * Guarded rather than trusted because the callback path fetches this
 * host from our servers: without the checks below, "localhost:6379" or
 * "169.254.169.254" would be an SSRF primitive handed over by a form.
 */
export function normaliseStoreUrl(input: string | null | undefined): NormalisedStore {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "Enter your store address." };

  // Dealers type "mystore.com", not "https://mystore.com".
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That doesn't look like a web address." };
  }

  if (url.protocol !== "https:") {
    // WooCommerce itself refuses to send credentials to a non-HTTPS
    // callback, and we should not send a dealer's keys over plaintext
    // in the other direction either.
    return { ok: false, reason: "Your store needs to be on https:// before it can be connected securely." };
  }

  const host = url.hostname.toLowerCase();

  // Loopback, link-local, private ranges and mDNS names. A store on
  // any of these is not reachable from our servers anyway, so this
  // rejects nothing legitimate.
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host);
  if (blocked) return { ok: false, reason: "That address isn't a public store." };

  // A dot is the cheapest way to reject a bare hostname without
  // resolving anything.
  if (!host.includes(".")) return { ok: false, reason: "That doesn't look like a store address." };

  // Path is preserved (WordPress is often installed in a subdirectory)
  // but query and hash are dropped — nothing in them belongs in an
  // authorize URL.
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, origin: `${url.origin}${path}`, host };
}

/**
 * The URL to send the dealer to. WooCommerce renders its own approval
 * screen there and, on approval, POSTs the credentials to callbackUrl.
 */
export function buildAuthorizeUrl(opts: {
  storeOrigin: string;
  appName: string;
  nonce: string;
  returnUrl: string;
  callbackUrl: string;
}): string {
  const url = new URL(`${opts.storeOrigin}/wc-auth/v1/authorize`);
  url.searchParams.set("app_name", opts.appName);
  // read, not read_write. Nothing in this product writes to a dealer's
  // store, and asking for write access we don't use would be both a
  // scarier approval screen and a worse thing to leak.
  url.searchParams.set("scope", "read");
  url.searchParams.set("user_id", opts.nonce);
  url.searchParams.set("return_url", opts.returnUrl);
  url.searchParams.set("callback_url", opts.callbackUrl);
  return url.toString();
}

export type WooCallbackPayload = {
  consumerKey: string;
  consumerSecret: string;
  nonce: string;
};

export type CallbackCheck = { ok: true; payload: WooCallbackPayload } | { ok: false; reason: string };

/**
 * WooCommerce's callback body, checked before anything is stored.
 *
 * Rejects rather than coerces: every field here ends up as a stored
 * credential or as the key that decides WHICH business gets it.
 */
export function validateCallbackPayload(body: any): CallbackCheck {
  const nonce = typeof body?.user_id === "string" ? body.user_id.trim() : "";
  const consumerKey = typeof body?.consumer_key === "string" ? body.consumer_key.trim() : "";
  const consumerSecret = typeof body?.consumer_secret === "string" ? body.consumer_secret.trim() : "";

  // 64 hex chars, exactly what createWooNonce produces. A length and
  // charset check here means a malformed or probing callback never
  // reaches the database lookup.
  if (!/^[0-9a-f]{64}$/.test(nonce)) return { ok: false, reason: "Invalid authorization reference." };
  if (!consumerKey || !consumerSecret) return { ok: false, reason: "WooCommerce sent no credentials." };

  return { ok: true, payload: { consumerKey, consumerSecret, nonce } };
}

/** Whether a stored pending record is still usable. */
export function isPendingFresh(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const started = new Date(createdAt).getTime();
  if (!Number.isFinite(started)) return false;
  // Future-dated records are treated as stale rather than valid
  // forever — a clock skew shouldn't extend a credential window.
  if (started > now) return false;
  return now - started < WOO_NONCE_TTL_MS;
}
