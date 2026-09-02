// ------------------------------------------------------------------
// Meta webhook payload signature verification (X-Hub-Signature-256).
// ------------------------------------------------------------------
// Meta signs every webhook POST with an HMAC-SHA256 of the RAW request
// body, keyed by the app secret, sent as:
//
//   X-Hub-Signature-256: sha256=<hex digest>
//
// Without checking it, the endpoint is an unauthenticated write: the
// URL is the only thing standing between the public internet and
// inserting fabricated leads. For /api/webhooks/meta-leads it is worse
// than fake rows — the same handler runs handleAutoReplyEntry, so a
// forged payload can make the product send messages on a dealer's
// behalf.
//
// The webhook paths are excluded from the auth middleware by design
// (matcher skips api/webhooks), because Meta has no Hawlai session.
// This signature IS the authentication for those routes; there is no
// second layer behind it.
//
// THE RAW BODY IS LOAD-BEARING. The digest must be computed over the
// exact bytes Meta sent. Calling request.json() and re-serialising
// produces different bytes — different key order, different whitespace
// — and the signature will never match. Callers must read the body
// with request.text() and parse it themselves afterwards.
//
// ALSO MISSING VERIFICATION, recorded not fixed (same class, out of
// scope for this pass): /api/webhooks/meta-messaging,
// /api/webhooks/whatsapp, /api/webhooks/vapi. meta-messaging uses this
// identical scheme and can be fixed with one call to the function
// below. /api/webhooks/resend already verifies its own signature.
// ------------------------------------------------------------------

import crypto from "crypto";

export type SignatureResult =
  | { valid: true }
  | { valid: false; reason: "not_configured" | "missing_header" | "malformed_header" | "mismatch" };

/**
 * Verifies a Meta webhook signature against the raw body.
 *
 * Returns a reason rather than a bare boolean so the caller can log
 * WHY it rejected — "no signature header" and "signature did not
 * match" are very different operational events, and collapsing them
 * makes a misconfiguration look like an attack.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): SignatureResult {
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) return { valid: false, reason: "not_configured" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  const [algorithm, digest] = signatureHeader.split("=");
  if (algorithm !== "sha256" || !digest) return { valid: false, reason: "malformed_header" };

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(digest, "utf8");
  // timingSafeEqual throws when lengths differ, so this check is not
  // an optimisation — without it a short signature crashes the route
  // instead of being rejected.
  if (expectedBuf.length !== actualBuf.length) return { valid: false, reason: "mismatch" };

  return crypto.timingSafeEqual(expectedBuf, actualBuf) ? { valid: true } : { valid: false, reason: "mismatch" };
}

/** Log line for a rejected webhook. Deliberately never includes the body, the signature, or the app secret. */
export function describeRejection(result: Extract<SignatureResult, { valid: false }>): string {
  switch (result.reason) {
    case "not_configured":
      // A configuration failure, not an attack. Says so, because this
      // one silently stops real leads arriving.
      return "FACEBOOK_APP_SECRET is not set — webhook payloads cannot be verified and are being rejected. Set it or leads will not arrive.";
    case "missing_header":
      return "rejected: no X-Hub-Signature-256 header";
    case "malformed_header":
      return "rejected: malformed X-Hub-Signature-256 header";
    case "mismatch":
      return "rejected: signature did not match";
  }
}
