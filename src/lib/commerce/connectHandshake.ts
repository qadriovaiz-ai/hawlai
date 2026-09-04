// Shared pieces of a redirect-based store connect handshake.
//
// Extracted when Shopify (Group B) turned out to need exactly what
// WooCommerce (A6) already had: a single-use unguessable nonce carried
// through a third-party redirect, and an expiry check on the pending
// record it maps to.
//
// Shared rather than copied because these two are the security core of
// both flows, and a subtle divergence — a shorter nonce here, a
// missing future-timestamp check there — is precisely the kind of
// inconsistency nobody notices until it matters.
//
// What is NOT shared is how each provider proves the callback is
// genuine, because they differ fundamentally: Shopify signs its
// redirect with an HMAC over the query string, and WooCommerce signs
// nothing at all (it has no shared secret to sign with, since the flow
// needs no app registration). Those live in shopifyAuth.ts and
// wooAuth.ts respectively.

import { randomBytes } from "crypto";

/** How long a started handshake stays usable. */
export const HANDSHAKE_TTL_MS = 15 * 60 * 1000;

/** 256 bits. In both flows this nonce is the link between a callback and a business. */
export function createHandshakeNonce(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Whether a string is shaped like one of our nonces.
 *
 * Checked before any database lookup, so malformed or probing
 * callbacks never reach a query.
 */
export function isValidNonceFormat(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Whether a stored pending record is still usable. */
export function isHandshakeFresh(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const started = new Date(createdAt).getTime();
  if (!Number.isFinite(started)) return false;
  // A future-dated record is stale, not valid forever — clock skew
  // must not extend a credential window.
  if (started > now) return false;
  return now - started < HANDSHAKE_TTL_MS;
}
