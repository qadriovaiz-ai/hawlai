// Who is allowed to post to the WhatsApp webhook.
//
// ──────────────────────────────────────────────────────────────────
// THE HOLE THIS CLOSES, found 23 November 2026 while auditing the move
// to Meta Cloud API, and live in production until this shipped.
//
// /api/webhooks/whatsapp authenticated NOBODY. Three ways:
//
//   1. middleware.ts's matcher explicitly excludes api/webhooks, so no
//      middleware runs on it.
//   2. The route contained zero occurrences of signature, hmac,
//      x-hub, verify_token, authorization or secret.
//   3. It exported POST only.
//
// The sole thing identifying the caller was the phone number IN THE
// REQUEST BODY, which the caller writes:
//
//   .eq("owner_whatsapp_number", phone).eq("owner_whatsapp_verified", true)
//
// `owner_whatsapp_verified` checks the STORED ROW, not the sender. So
// anyone who knew the webhook URL and a connected owner's WhatsApp
// number could post a forged body and reach Master Chat AS THAT OWNER,
// with full tool access, and APPROVE n on anything pending below
// critical tier. Neither fact is a secret — the number is usually
// printed on the business's own website.
//
// IT WAS KNOWN AND RECORDED, which is why this file exists rather than
// a scramble. metaSignature.ts's own header says:
//
//   "STILL MISSING VERIFICATION, recorded not fixed (different
//    schemes, so not a one-line change): /api/webhooks/whatsapp"
//
// That reasoning was right at the time: Gupshup does not sign its
// deliveries, so there was no signature to check. Going direct to Meta
// removes the obstacle, because Meta signs every one.
// ──────────────────────────────────────────────────────────────────
//
// TWO SCHEMES, BECAUSE THERE ARE TWO PROVIDERS and the owner chose to
// keep the Gupshup code rather than delete it:
//
//   Meta      X-Hub-Signature-256, HMAC-SHA256 over the raw body.
//   Gupshup   no signing of any kind. It can send a custom header on
//             its callback, so a shared secret is the only thing
//             available — strictly weaker, and labelled as such.
//
// IT FAILS CLOSED, INCLUDING WHEN NOTHING IS CONFIGURED. An
// unconfigured deploy refuses every delivery. That is deliberate and
// it is the opposite of what an auth path usually drifts into: "no
// secret set, so skip the check" turns the fix back into the hole, and
// it does it silently on exactly the deploy where someone forgot.
//
// The cost is stated rather than hidden: if a Gupshup number is live,
// WhatsApp stops working until a secret is set. The reason is in
// `describeWhatsAppRejection` so it reaches the owner as a sentence
// rather than as silence.

import crypto from "crypto";
import { verifyMetaSignature, type SignatureResult } from "@/lib/webhooks/metaSignature";

export type SenderVerdict =
  | { ok: true; via: "meta_signature" | "shared_secret" }
  | { ok: false; reason: "not_configured" | "bad_signature" | "bad_secret" | "no_credential"; detail: string };

/** The header Gupshup (or any unsigned provider) is configured to send. */
export const SHARED_SECRET_HEADER = "x-hawlai-webhook-secret";

/**
 * A constant-time compare that does not throw on a length mismatch.
 *
 * `crypto.timingSafeEqual` throws when the buffers differ in length,
 * so the length check is not an optimisation — without it a short
 * secret crashes the route instead of being rejected, which is a
 * 500 where a 401 belongs.
 */
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * May this request act on the business's behalf?
 *
 * THE RAW BODY IS LOAD-BEARING. The Meta digest is over the exact
 * bytes sent, so a caller must read the body with `request.text()` and
 * parse it afterwards — `request.json()` consumes the stream and
 * re-serialising produces different bytes, different key order,
 * different whitespace, and a signature that can never match.
 *
 * THE SIGNATURE IS CHECKED BEFORE THE BODY IS PARSED, and the caller's
 * ordering is what makes that true. By the time anything reads
 * `phone` out of the payload, a forged request has already been
 * refused.
 */
export function verifyWhatsAppSender(rawBody: string, headers: Headers): SenderVerdict {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const sharedSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

  // META FIRST, because it is the stronger scheme and the one this
  // product is moving to. A deploy carrying both secrets is verified
  // by signature, not by the weaker header.
  if (appSecret) {
    const result: SignatureResult = verifyMetaSignature(rawBody, headers.get("x-hub-signature-256"), appSecret);
    if (result.valid) return { ok: true, via: "meta_signature" };
    // IT DOES NOT FALL THROUGH TO THE SHARED SECRET. A signed provider
    // whose signature fails is a failure, not an invitation to try an
    // easier door — and a caller that can set a header could otherwise
    // downgrade itself past the signature by simply omitting it.
    return { ok: false, reason: "bad_signature", detail: `X-Hub-Signature-256 ${result.valid ? "" : result.reason}` };
  }

  if (sharedSecret) {
    const presented = headers.get(SHARED_SECRET_HEADER);
    if (presented && sameSecret(presented, sharedSecret)) return { ok: true, via: "shared_secret" };
    return { ok: false, reason: "bad_secret", detail: presented ? `${SHARED_SECRET_HEADER} did not match` : `no ${SHARED_SECRET_HEADER} header` };
  }

  return {
    ok: false,
    reason: "not_configured",
    detail: "neither WHATSAPP_APP_SECRET nor WHATSAPP_WEBHOOK_SECRET is set",
  };
}

/**
 * The GET handshake Meta performs before it will deliver anything.
 *
 * Meta calls the callback URL once with `hub.mode=subscribe` and a
 * token the owner typed into both places, and expects the challenge
 * echoed back as plain text. Same shape as meta-messaging's.
 *
 * AN UNSET TOKEN FAILS, rather than matching an absent parameter.
 * `token === expectedToken` with both undefined is true, and that
 * would hand the challenge to anyone who asked.
 */
export function whatsappChallenge(url: string): { ok: true; challenge: string } | { ok: false; detail: string } {
  const params = new URL(url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) return { ok: false, detail: "WHATSAPP_VERIFY_TOKEN is not set" };
  if (mode !== "subscribe") return { ok: false, detail: `hub.mode was ${mode ?? "absent"}` };
  if (!token || !sameSecret(token, expected)) return { ok: false, detail: "hub.verify_token did not match" };
  if (!challenge) return { ok: false, detail: "no hub.challenge to echo" };
  return { ok: true, challenge };
}

/**
 * What the owner is told, and what the log says.
 *
 * A misconfiguration and an attack look identical from outside — every
 * delivery refused — so the sentence has to distinguish them. The
 * `not_configured` case is the one that silently stops WhatsApp
 * working, so it says what to set and why nothing arrives.
 *
 * Never includes the body, the signature, the secret or the phone
 * number.
 */
export function describeWhatsAppRejection(verdict: Extract<SenderVerdict, { ok: false }>): string {
  switch (verdict.reason) {
    case "not_configured":
      return "WHATSAPP_APP_SECRET (Meta) or WHATSAPP_WEBHOOK_SECRET (Gupshup) is not set — inbound WhatsApp messages cannot be verified and are being refused. Set one or nothing will arrive.";
    case "bad_signature":
      return `rejected: ${verdict.detail}`;
    case "bad_secret":
      return `rejected: ${verdict.detail}`;
    case "no_credential":
      return "rejected: no credential presented";
  }
}
