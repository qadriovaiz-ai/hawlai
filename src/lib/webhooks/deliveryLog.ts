// Recording that a webhook arrived, and which gate ended it.
//
// WHY THIS EXISTS. The auto-reply toggles were on in production and
// `auto_reply_log` had zero rows for months. Diagnosing that took eight
// days and a reading of five files, because every gate in the path
// returns silently:
//
//   the route        a rejected signature → a console line and a 401
//   the handler      no entry id          → return
//                    no business matched  → return
//                    no reply token       → return
//                    both toggles off     → return
//
// None of those is wrong as behaviour. A webhook endpoint SHOULD be
// quiet: Meta retries, and a noisy failure on a public endpoint is its
// own problem. What was wrong is that being quiet to Meta was also
// being quiet to the owner and to us.
//
// So: one row per entry, metadata only, never throwing. A failure to
// record must never stop a reply being sent — the log is here to explain
// the product, not to become a new way for it to break.

export type DeliveryOutcome =
  | "signature_rejected"
  | "no_entry_id"
  | "no_business_matched"
  | "no_reply_token"
  | "both_toggles_off"
  | "nothing_to_reply_to"
  | "handled";

export type DeliveryRecord = {
  source: "meta-leads" | "meta-messaging";
  outcome: DeliveryOutcome;
  /** The Page or Instagram Business id Meta named, when the payload had one. */
  entryId?: string | null;
  /** The business this matched, when it matched one. Null is a real answer. */
  dealershipId?: string | null;
  /** One short sentence for a human. NEVER a body, a token or a sender id. */
  detail?: string | null;
};

/**
 * Record a delivery when the caller has no client yet — the rejection
 * path, which runs before any database work.
 *
 * BUILDS THE CLIENT INSIDE THE try, which is the whole reason this
 * exists. `createServiceClient()` THROWS when the Supabase env vars are
 * absent, and the first version of this called it at the call site: the
 * signature rejection then threw instead of returning its 401, and
 * tests/leadIngestion.test.ts caught it. A webhook rejection must not
 * depend on the database being reachable — it is the one response the
 * route must always be able to give.
 */
export async function recordDeliveryStandalone(record: DeliveryRecord): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/service");
    await recordDelivery(createServiceClient(), record);
  } catch (err: any) {
    console.error(`[webhook-delivery] could not reach the database to record a ${record.outcome}: ${err?.message ?? err}`);
  }
}

/** How much of `detail` is kept. A sentence, not a payload. */
export const DETAIL_CHARS = 300;

function oneLine(value: string | null | undefined): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, DETAIL_CHARS) : null;
}

/**
 * Write one delivery row.
 *
 * NEVER THROWS, AND NEVER AWAITS ANYTHING THE REPLY NEEDS. Called from a
 * public webhook route, so a database hiccup here must leave the rest of
 * the handler exactly as it was. A swallowed error is the right choice
 * in this one direction — and it is the only place in this file where
 * swallowing anything is acceptable, which is why it says so.
 */
export async function recordDelivery(supabase: any, record: DeliveryRecord): Promise<void> {
  if (!supabase) {
    console.error(`[webhook-delivery] no client to record a ${record.outcome} delivery with`);
    return;
  }
  try {
    await supabase.from("webhook_deliveries").insert({
      source: record.source,
      outcome: record.outcome,
      // An id Meta sent, kept even when it matched nothing — that row is
      // the most diagnostic one in the table.
      entry_id: oneLine(record.entryId),
      dealership_id: record.dealershipId ?? null,
      detail: oneLine(record.detail),
    });
  } catch (err: any) {
    console.error(`[webhook-delivery] could not record a ${record.outcome} delivery: ${err?.message ?? err}`);
  }
}
