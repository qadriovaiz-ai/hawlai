// Turning a provider's webhook body into messages this product can act on.
//
// M2 of docs/RESEARCH-WHATSAPP-META-DIRECT.md. Pulled out of the route
// because it is the piece with all the shape risk in it, and a pure
// function is the only part of that route that can be tested
// exhaustively — nothing executes the route's own POST today.
//
// ──────────────────────────────────────────────────────────────────
// CHOSEN BY PROVIDER, NOT GUESSED. The version in the route tried a
// few plausible field paths and took whichever answered, with its own
// comment admitting it had never met live traffic. That is a
// reasonable way to ship ahead of credentials and a bad way to keep
// running: two providers whose shapes overlap in the wrong place
// would silently pick each other's fields.
//
// THREE THINGS META DOES THAT GUPSHUP DOES NOT, and each one is a way
// to lose an owner's message:
//
//   1. `messages` IS AN ARRAY. Meta batches. A parser that reads
//      [0] and returns drops the rest — and the dropped one may be
//      the "APPROVE 2" that mattered.
//   2. STATUSES ARRIVE ON THE SAME ENDPOINT, as `value.statuses`:
//      delivered, read, failed. They have an `id` and no `from`, and a
//      loose parser reads them as messages from nobody.
//   3. ENTRIES AND CHANGES NEST. One delivery can carry several
//      entries, each with several changes, and only the changes whose
//      `field` is "messages" are messages at all.
//
// NON-TEXT IS SKIPPED, NOT MISHANDLED. Images, buttons, locations and
// interactive replies are a real follow-up; silently treating one as
// empty text would run a Master Chat turn on nothing. They are dropped
// here and counted, so "he sent a photo and nothing happened" is
// answerable.
// ──────────────────────────────────────────────────────────────────

import type { WhatsAppProvider } from "./client";
import { normalizePhoneNumber } from "./gupshupClient";

export type IncomingMessage = { phone: string; text: string };


export type InboundRead = {
  /** Text messages, in the order the provider sent them. */
  messages: IncomingMessage[];
  /**
   * Why anything was left out — one short phrase per reason, for the
   * delivery log. Never a body, a number or a token.
   *
   * It exists because "nothing happened" is the hardest WhatsApp
   * report to answer, and an empty `messages` with no explanation is
   * indistinguishable from a provider that never called.
   */
  skipped: string[];
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Meta Cloud API.
 *
 * UNVERIFIED AGAINST LIVE TRAFFIC. Written from Meta's documented
 * webhook shape and nothing else — the live run is M4. The shape is
 * `entry[].changes[].value.messages[]`, each message carrying `from`,
 * `type`, and the body under a key named after the type.
 */
function fromMeta(body: any): InboundRead {
  const messages: IncomingMessage[] = [];
  const skipped: string[] = [];

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  if (!entries.length) return { messages, skipped: ["no entry[] in the payload"] };

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      // ONLY `messages`. A WhatsApp Business Account also emits
      // account_update, phone_number_quality_update and others on the
      // same subscription, and reading their `value` as a message is
      // how a parser invents a sender.
      if (change?.field && change.field !== "messages") {
        skipped.push(`change field "${String(change.field).slice(0, 40)}"`);
        continue;
      }
      const value = change?.value;
      if (Array.isArray(value?.statuses) && value.statuses.length) {
        // Delivery receipts. Expected, frequent, and not a message.
        skipped.push("delivery status");
      }
      const list = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of list) {
        const type = message?.type;

        if (type !== "text") {
          skipped.push(`message type "${String(type ?? "unknown").slice(0, 20)}"`);
          continue;
        }
        const from = text(message?.from);
        const said = text(message?.text?.body);
        if (!from || !said) {
          skipped.push("a text message with no sender or no body");
          continue;
        }
        messages.push({ phone: normalizePhoneNumber(from), text: said });
      }
    }
  }
  return { messages, skipped };
}

/**
 * Gupshup, unchanged in behaviour from the version in the route.
 *
 * Still the documented v2 shape with the same defensive fallbacks, and
 * still never exercised against live Gupshup traffic. Kept rather than
 * tidied: the owner chose to keep this provider, and rewriting a guess
 * nobody has tested would replace one unverified shape with another.
 */
function fromGupshup(body: any): InboundRead {
  const payload = body?.payload ?? body;
  const type = payload?.type;
  if (type && type !== "text") return { messages: [], skipped: [`message type "${String(type).slice(0, 20)}"`] };

  const phone = payload?.sender?.phone ?? payload?.source ?? body?.source;
  const said = payload?.payload?.text ?? payload?.text ?? body?.text;
  const from = text(phone);
  const words = text(said);
  if (!from || !words) return { messages: [], skipped: ["no sender or no body"] };
  return { messages: [{ phone: normalizePhoneNumber(from), text: words }], skipped: [] };
}

export function readInbound(body: unknown, provider: WhatsAppProvider): InboundRead {
  return provider === "meta" ? fromMeta(body) : fromGupshup(body);
}
