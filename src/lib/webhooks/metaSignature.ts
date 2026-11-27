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
// USED BY: /api/webhooks/meta-leads and /api/webhooks/meta-messaging.
// Both run handleAutoReplyEntry, so an unsigned payload on either can
// make the product send messages on a dealer's behalf.
//
// STILL MISSING VERIFICATION, recorded not fixed (different schemes,
// so not a one-line change): /api/webhooks/whatsapp and
// /api/webhooks/vapi. /api/webhooks/resend already verifies its own.
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
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  /**
   * The secret to key the digest with. Defaults to FACEBOOK_APP_SECRET,
   * which is what meta-leads and meta-messaging use.
   *
   * WHY IT IS AN ARGUMENT NOW, 23 November 2026. WhatsApp went direct
   * to Meta Cloud API, and its product may sit on a DIFFERENT Meta app
   * from the lead-ads one — in which case it has a different app
   * secret, and verifying against the wrong one rejects every genuine
   * delivery while looking exactly like an attack.
   *
   * Passing it in rather than reading a second env var here keeps this
   * function ignorant of which caller it is serving, so a third
   * webhook cannot quietly inherit WhatsApp's secret by being added to
   * an `??` chain nobody reads.
   */
  secretOverride?: string | null
): SignatureResult {
  const appSecret = secretOverride ?? process.env.FACEBOOK_APP_SECRET;
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

/**
 * WHICH SECRET A REJECTED DELIVERY WAS ACTUALLY SIGNED WITH — a diagnosis,
 * never a door. 27 November 2026.
 *
 * After Instagram was reconnected, Meta began delivering — and every
 * delivery was rejected with "signature did not match": 20 in 13 minutes,
 * the owner's test DMs among them, so none reached the reply. Both Meta
 * routes verify against FACEBOOK_APP_SECRET, while an app using Instagram
 * Login also has its own Instagram app secret. Meta's documentation says
 * "your app's App Secret" without saying which, so the fix is not guessed:
 * this records which one matches, and the fix follows the evidence.
 *
 * IT ACCEPTS NOTHING. The caller still rejects; this only adds a sentence
 * to the recorded reason. Never names a secret's value or the body.
 */
export function rejectionDiagnosis(rawBody: string, signatureHeader: string | null): string {
  const instagramSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!instagramSecret) return "INSTAGRAM_APP_SECRET is not set, so the other secret could not be compared";
  const alt = verifyMetaSignature(rawBody, signatureHeader, instagramSecret);
  return alt.valid
    ? "it DOES match INSTAGRAM_APP_SECRET — this delivery was signed with the Instagram app's secret"
    : "it matches neither FACEBOOK_APP_SECRET nor INSTAGRAM_APP_SECRET";
}

/** Which secret a delivery was verified with, when it was. */
export type DeliverySignature =
  | { valid: true; signedWith: "facebook" | "instagram" }
  | Extract<SignatureResult, { valid: false }>;

/**
 * Verify a delivery to a Meta webhook route with THE RIGHT SECRET FOR ITS
 * KIND — 27 November 2026.
 *
 * MEASURED, NOT ASSUMED. After Instagram was reconnected, every delivery
 * was rejected as "signature did not match". rejectionDiagnosis (above)
 * was shipped first, accepting nothing, and the owner's next three test
 * DMs all recorded "it DOES match INSTAGRAM_APP_SECRET" — none matched
 * FACEBOOK_APP_SECRET. An app using Instagram Login signs Instagram's
 * webhooks with the Instagram app's own secret.
 *
 * THE DELIVERY'S `object` CHOOSES THE KEY, AND THAT IS SAFE even though
 * the body is not trusted yet: a claimed object only decides which secret
 * to check, and nothing is accepted unless it is signed with that secret.
 *
 *   object "instagram"   INSTAGRAM_APP_SECRET, then FACEBOOK_APP_SECRET —
 *                        the second because Instagram connected through
 *                        Facebook Login is signed with the Facebook app's
 *                        secret, which is how this route always verified
 *   anything else        FACEBOOK_APP_SECRET ONLY
 *
 * So the Instagram secret can never admit a Page or lead-ads delivery: a
 * payload signed with it is accepted only if it says it is Instagram, and
 * then the handler treats it as Instagram.
 */
export function verifyMetaDelivery(rawBody: string, signatureHeader: string | null): DeliverySignature {
  let object: unknown;
  try {
    object = JSON.parse(rawBody)?.object;
  } catch {
    object = undefined;
  }
  if (object === "instagram") {
    const instagramSecret = process.env.INSTAGRAM_APP_SECRET;
    if (instagramSecret) {
      const asInstagram = verifyMetaSignature(rawBody, signatureHeader, instagramSecret);
      if (asInstagram.valid) return { valid: true, signedWith: "instagram" };
    }
  }
  const asFacebook = verifyMetaSignature(rawBody, signatureHeader);
  return asFacebook.valid ? { valid: true, signedWith: "facebook" } : asFacebook;
}
