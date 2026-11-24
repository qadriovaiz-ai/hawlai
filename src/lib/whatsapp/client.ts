// Which WhatsApp provider is live, and the one door every send uses.
//
// The product has two transports — Meta's Cloud API directly, and
// Gupshup, a reseller it used first. The owner chose to keep Gupshup
// rather than delete it: a BSP is a real fallback if a direct
// integration is ever rate-limited or suspended.
//
// ──────────────────────────────────────────────────────────────────
// THE CHOICE IS DECLARED, NEVER INFERRED, and this is the whole
// reason the file exists rather than an `??` in the webhook.
//
// The tempting version is "use Meta if WHATSAPP_ACCESS_TOKEN is set,
// else Gupshup". That picks a provider from whichever secrets a
// deploy happens to carry — so a half-finished migration, or a
// leftover Gupshup key in one environment, silently routes a
// merchant's messages through a provider nobody chose. The failure is
// invisible: messages still send, from the wrong number, and the
// first sign is a customer replying to a thread the business cannot
// see.
//
// So WHATSAPP_PROVIDER says it, and an unset or unrecognised value is
// a refusal rather than a default. The same fail-closed direction
// verifySender.ts takes on the way in.
// ──────────────────────────────────────────────────────────────────

import * as gupshup from "./gupshupClient";
import * as meta from "./metaClient";

export type WhatsAppProvider = "meta" | "gupshup";

const PROVIDERS: Record<WhatsAppProvider, { sendText: typeof gupshup.sendWhatsAppText; sendImage: typeof gupshup.sendWhatsAppImage }> = {
  meta: { sendText: meta.sendWhatsAppText, sendImage: meta.sendWhatsAppImage },
  gupshup: { sendText: gupshup.sendWhatsAppText, sendImage: gupshup.sendWhatsAppImage },
};

/**
 * Which provider this deployment sends through.
 *
 * Throws rather than defaulting. A default here would be a guess about
 * whose phone number a merchant's customers see.
 */
export function activeProvider(): WhatsAppProvider {
  const declared = (process.env.WHATSAPP_PROVIDER ?? "").trim().toLowerCase();
  if (declared === "meta" || declared === "gupshup") return declared;
  throw new Error(
    declared
      ? `WHATSAPP_PROVIDER is "${declared}", which is not a provider — set it to "meta" or "gupshup".`
      : 'WhatsApp isn\'t set up yet — WHATSAPP_PROVIDER isn\'t set. Set it to "meta" or "gupshup".'
  );
}

export async function sendWhatsAppText(destination: string, text: string) {
  return PROVIDERS[activeProvider()].sendText(destination, text);
}

export async function sendWhatsAppImage(destination: string, imageUrl: string, caption?: string) {
  return PROVIDERS[activeProvider()].sendImage(destination, imageUrl, caption);
}

// A TEMPLATE SENDER LIVED HERE, and was removed on 24 November 2026
// with the rest of H3's per-approval notice. It existed so an approval
// could be announced outside WhatsApp's 24-hour window, which is the
// only time Meta accepts anything but free-form. The owner replaced
// that notice with a count in the daily email — no per-message cost,
// no template — so nothing needed it any more.
//
// It was never sent once: both templates were still PENDING when the
// design changed. docs/RESEARCH-WHATSAPP-PROACTIVE.md and the
// DECISIONS entries of 23–24 November carry the reasoning, and the
// code is in git if a template is ever wanted again.

/**
 * Digits only, no `+`, no leading `00`.
 *
 * PROVIDER-NEUTRAL, which is why it lives here now rather than in a
 * file named after one of them. Gupshup requires this shape and Meta
 * accepts it, so there is one answer — and the three callers
 * (`whatsapp-connect/start`, `whatsapp-connect/verify`, and the
 * webhook) were importing it from `gupshupClient` while having nothing
 * to do with Gupshup.
 *
 * Re-exported rather than reimplemented: WhatsApp payloads and
 * phone-entry forms disagree about formatting, and two copies of the
 * cleanup would drift the first time one of them learned about a new
 * one.
 */
export { normalizePhoneNumber } from "./gupshupClient";
